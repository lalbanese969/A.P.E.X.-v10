"""
pipeline.py — the A.P.E.X. chat pipeline: memory + intent + actions + real brain.

Per user prompt:
  1. Resolve memory -> small Memory Packet.
  2. INTENT ROUTER (Ollama, cheap) -> {calendar_query | email_search | email_draft | email_refine | chat}.
  3. Run the matching ACTION against the (mock) connectors: calendar.upcoming / email.search / draft.
  4. Build a CONTEXT block (memory + profile + writing style + calendar/email results).
  5. FINAL ANSWER via the AI Center (Gemini, budget 1/turn; Ollama fallback). Drafting also uses
     that single user-facing call to write the email body.
  6. Memory Writer placeholder (non-destructive) + draft-feedback style learning (Ollama).
  7. Log the resolution.

Brains are reached through backend.ai.center.AICenter, so cost routing + the Gemini budget live
there, not here. If no brain is reachable at all, we degrade to a readable memory-only message.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Optional

from .ai.center import AICenter
from .ai.providers.base import ProviderError
from .connections import registry
from .memory import resolver, packet_builder, writer, profile, paths

_KNOWN_INTENTS = {"calendar_query", "email_search", "email_draft", "email_refine", "chat"}
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def handle_prompt(user_prompt: str, session_context: Optional[str] = None,
                  prior_draft: Optional[dict] = None) -> dict[str, Any]:
    """Run one user prompt through memory + intent + actions + brain."""
    user_prompt = (user_prompt or "").strip()
    center = AICenter()
    sess = center.session()

    # 1) memory
    candidates = resolver.resolve(user_prompt, session_context=session_context)
    packet = packet_builder.build_packet(user_prompt, session_context=session_context)

    # 2) intent
    intent, params = classify(user_prompt, center, has_prior_draft=bool(prior_draft))

    # 3) actions + 5) answer
    result: dict[str, Any] = {
        "user_prompt": user_prompt,
        "memory_packet": packet,
        "intent": intent,
    }
    ai_meta = {"provider": None, "model": None}

    try:
        if intent == "calendar_query":
            events = [e.to_dict() for e in registry.calendar_connector().upcoming(params["days"])]
            result["calendar"] = events
            text, ai_meta = _answer(sess, user_prompt, packet, calendar=events)
            result["apex_response"] = text

        elif intent == "email_search":
            matches = [m.to_dict() for m in registry.email_connector().search(params["query"] or user_prompt)]
            result["email_matches"] = matches
            text, ai_meta = _answer(sess, user_prompt, packet, emails=matches)
            result["apex_response"] = text

        elif intent == "email_draft":
            draft, matches, ai_meta = _draft_email(sess, user_prompt, params, packet)
            result["draft"] = draft
            result["email_matches"] = matches
            result["apex_response"] = ("Here's a draft for you to review. Tell me what to change "
                                       "(tone, length, wording) and I'll adjust it.")

        elif intent == "email_refine":
            learned = _learn_style(sess, user_prompt)
            draft, _, ai_meta = _draft_email(sess, user_prompt, params, packet, prior_draft=prior_draft)
            result["draft"] = draft
            result["style_learned"] = learned
            result["apex_response"] = ("Updated the draft and noted your preference for next time. "
                                       "Anything else to tweak?")

        else:  # chat
            text, ai_meta = _answer(sess, user_prompt, packet)
            result["apex_response"] = text

    except ProviderError as e:
        # no brain reachable -> graceful, memory-only fallback (never hard-fail)
        result["apex_response"] = _memory_only_fallback(packet, str(e))

    result["ai_meta"] = ai_meta

    # 6) memory writer (non-destructive) + 7) resolution log
    writer.review_interaction(user_prompt, result.get("apex_response", ""))
    _log_resolution(user_prompt, candidates, packet, intent)

    return result


# ---------------------------------------------------------------------------
# Intent classification (Ollama + heuristic fallback)
# ---------------------------------------------------------------------------

def classify(prompt: str, center: AICenter, has_prior_draft: bool = False) -> tuple[str, dict]:
    """
    Return (intent, params).

    The keyword heuristic is reliable for the action intents (it keys off clear words
    like "draft", "calendar", and—for refine—an existing draft + edit words), so we
    TRUST it when it's confident. We only consult the small local model to break ties
    when the heuristic falls back to "chat", since small models are unreliable on short
    prompts and shouldn't override a confident keyword match.
    """
    intent, params = _heuristic_intent(prompt, has_prior_draft)
    if intent != "chat":
        return intent, params  # confident keyword match — don't let the model override it

    # Ambiguous: ask a small local model whether it's actually an action intent.
    try:
        sys_msg = {
            "role": "system",
            "content": ("Classify the user's message into exactly one intent: "
                        "calendar_query, email_search, email_draft, or chat. "
                        "Reply with ONLY the intent word, nothing else."),
        }
        res = center.run_task("classify", [sys_msg, {"role": "user", "content": prompt}], "small")
        guess = re.sub(r"[^a-z_]", "", res.text.strip().lower().split()[0]) if res.text.strip() else ""
        if guess in {"calendar_query", "email_search", "email_draft"}:
            intent = guess
    except ProviderError:
        pass  # keep "chat"

    return intent, params


def _heuristic_intent(prompt: str, has_prior_draft: bool) -> tuple[str, dict]:
    p = prompt.lower()
    days = 7
    if "today" in p:
        days = 1
    elif "tomorrow" in p:
        days = 2
    elif "week" in p:
        days = 7

    params = {"days": days, "query": _search_query(prompt), "to": None}

    refine_words = any(w in p for w in ("change", "shorter", "longer", "make it", "instead",
                                        "tone", "reword", "tweak", "more formal", "less formal"))
    if has_prior_draft and refine_words:
        return "email_refine", params

    if any(w in p for w in ("draft", "reply", "respond", "write an email", "compose", "resend", "follow up")):
        return "email_draft", params
    if ("email" in p or "inbox" in p) and any(w in p for w in ("find", "search", "look for", "show")):
        return "email_search", params
    if any(w in p for w in ("calendar", "schedule", "agenda", "appointment", "meeting")) or \
       ("today" in p and any(w in p for w in ("anything", "what", "have", "do i"))):
        return "calendar_query", params
    return "chat", params


def _search_query(prompt: str) -> str:
    """Pull likely search keywords out of a prompt (drops common filler words)."""
    stop = {"find", "the", "old", "email", "emails", "that", "about", "a", "an", "for", "to",
            "me", "my", "and", "help", "draft", "resend", "please", "can", "you", "from",
            "with", "of", "in", "on", "search", "look", "show"}
    words = re.findall(r"[a-z0-9]+", prompt.lower())
    keep = [w for w in words if w not in stop and len(w) > 2]
    return " ".join(keep[:6])


# ---------------------------------------------------------------------------
# Answering (chat / calendar / email_search) — one user-facing brain call
# ---------------------------------------------------------------------------

def _answer(sess, prompt, packet, calendar=None, emails=None) -> tuple[str, dict]:
    system = _system_base() + "\n\n" + _context_block(packet, calendar=calendar, emails=emails)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    res = sess.run_task("user_answer", messages)
    return res.text, {"provider": res.provider, "model": res.model}


# ---------------------------------------------------------------------------
# Email drafting + style learning
# ---------------------------------------------------------------------------

def _draft_email(sess, prompt, params, packet, prior_draft=None) -> tuple[dict, list, dict]:
    """Find a reference email (if any), then have the brain write the body (1 user-facing call)."""
    connector = registry.email_connector()
    matches = [m.to_dict() for m in connector.search(params["query"])] if params["query"] else []
    ref = matches[0] if matches else None

    to = _pick_recipient(ref, prior_draft)
    subject = _pick_subject(ref, prior_draft)

    style = profile.writing_style_brief()
    system = (_system_base()
              + "\n\nYou are drafting an email on the user's behalf. "
              + "Write ONLY the email body (no subject line, no commentary). "
              + f"Writing style to follow: {style}\n\n"
              + _context_block(packet, emails=matches))

    instruction = prompt
    if prior_draft:
        instruction = (f"Revise this previous draft based on the feedback.\n\n"
                       f"PREVIOUS DRAFT:\n{prior_draft.get('body','')}\n\nFEEDBACK: {prompt}")

    messages = [{"role": "system", "content": system}, {"role": "user", "content": instruction}]
    res = sess.run_task("user_answer", messages)

    from .connections.email.base import EmailDraft
    draft_obj = EmailDraft(to=to, subject=subject, body=_clean_draft_body(res.text),
                           account_id=(ref or {}).get("account_id", "gmail_personal"),
                           in_reply_to=(ref or {}).get("id"))
    saved = connector.create_draft(draft_obj)
    return saved.to_dict(), matches, {"provider": res.provider, "model": res.model}


def _learn_style(sess, feedback: str) -> Optional[str]:
    """Use a small local model to turn draft feedback into a reusable style preference."""
    try:
        system = {"role": "system", "content": (
            "The user gave feedback on an email draft. Express the lasting WRITING PREFERENCE it "
            "implies as one short imperative sentence (e.g. 'Keep emails shorter and more direct.'). "
            "Reply with ONLY that sentence.")}
        res = sess.run_task("extract_style", [system, {"role": "user", "content": feedback}], "small")
        pref = res.text.strip().splitlines()[0].strip() if res.text.strip() else ""
        if pref:
            profile.add_style_preference(pref, source="user_feedback")
            return pref
    except ProviderError:
        pass
    return None


_PREAMBLE_RE = re.compile(r"^\s*(here'?s|here is|sure|okay|got it)\b.*:\s*$", re.IGNORECASE)


def _clean_draft_body(text: str) -> str:
    """Strip a chatty preamble line some local models add (e.g. 'Here's the draft email:')."""
    lines = text.strip().splitlines()
    if lines and _PREAMBLE_RE.match(lines[0]):
        lines = lines[1:]
    # drop leading blank lines left behind
    while lines and not lines[0].strip():
        lines = lines[1:]
    return "\n".join(lines).strip()


def _pick_recipient(ref: dict | None, prior_draft: dict | None) -> str:
    if prior_draft and prior_draft.get("to"):
        return prior_draft["to"]
    if ref:
        # prefer an address found in the body, else the sender's address
        m = _EMAIL_RE.search(ref.get("body", ""))
        if m:
            return m.group(0)
        m = _EMAIL_RE.search(ref.get("sender", ""))
        if m:
            return m.group(0)
    return ""


def _pick_subject(ref: dict | None, prior_draft: dict | None) -> str:
    if prior_draft and prior_draft.get("subject"):
        return prior_draft["subject"]
    if ref:
        subj = ref.get("subject", "")
        return subj if subj.lower().startswith("re:") else f"Re: {subj}"
    return "(no subject)"


# ---------------------------------------------------------------------------
# Prompt building blocks
# ---------------------------------------------------------------------------

def _system_base() -> str:
    p = profile.profile_summary()
    style = p.get("tone") or "warm-professional"
    return ("You are A.P.E.X. (Adaptive Personal Executive Xpert), the user's personal assistant. "
            f"Speak as one assistant, {style} in tone. Be concise and genuinely helpful. "
            "Use the CONTEXT below when relevant; do not invent facts that aren't given.")


def _context_block(packet: dict, calendar=None, emails=None) -> str:
    parts = ["CONTEXT:"]
    if packet.get("memory_needed") and packet.get("loaded_records"):
        parts.append("Memory: " + json.dumps(packet["loaded_records"], ensure_ascii=False))
    if calendar is not None:
        if calendar:
            lines = [f"- {e['title']} ({e['start']} to {e['end']})"
                     + (f" @ {e['location']}" if e.get("location") else "")
                     for e in calendar]
            parts.append("Calendar (upcoming):\n" + "\n".join(lines))
        else:
            parts.append("Calendar: no events in range.")
    if emails is not None:
        if emails:
            lines = [f"- [{m['id']}] from {m['sender']} | {m['subject']} | {m['snippet']}"
                     for m in emails]
            parts.append("Emails found:\n" + "\n".join(lines))
        else:
            parts.append("Emails: no matches found.")
    return "\n".join(parts)


def _memory_only_fallback(packet: dict, err: str) -> str:
    base = "(A.P.E.X. — no AI brain reachable right now, showing memory only) "
    if packet.get("memory_needed") and packet.get("loaded_records"):
        names = ", ".join(r.get("display_name", "?") for r in packet["loaded_records"])
        return base + f"Relevant memory: {names}. (Start Ollama or set a Gemini key for full answers.)"
    return base + "I couldn't reach a model. Start Ollama or set a Gemini key, then try again."


# ---------------------------------------------------------------------------
# Resolution logging
# ---------------------------------------------------------------------------

def _log_resolution(user_prompt, candidates, packet, intent) -> None:
    paths.LOGS_DIR.mkdir(parents=True, exist_ok=True)
    packet_json = json.dumps(packet, ensure_ascii=False)
    loaded = packet.get("loaded_records", [])
    entry = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "user_prompt": user_prompt,
        "intent": intent,
        "records_considered": [
            {"id": c["card"].get("id"), "score": c.get("score"), "matched_on": c.get("matched_on")}
            for c in candidates
        ],
        "records_loaded": [r.get("id") for r in loaded],
        "sections_loaded": {r.get("id"): r.get("sections_loaded", []) for r in loaded},
        "packet_size_chars": len(packet_json),
        "approx_tokens": round(len(packet_json) / 4),
    }
    with open(paths.RESOLUTION_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
