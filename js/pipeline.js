/* ============================================================================
   [MODULE: pipeline.js]
   The A.P.E.X. chat pipeline — ported from backend/pipeline.py. Per message:
     1. memory.buildPacket()           -> small, relevant memory only
     2. classify intent                -> HEURISTIC ONLY (see note below)
     3. run the matching action        -> calendar / email search / draft / refine / chat
     4. build a context block          -> memory + calendar/email results
     5. aiCenter.runTask("user_answer") -> the real reply (Groq, Gemini fallback)
     6. memory.reviewInteraction()      -> non-destructive write-proposal log

   Simplification vs. the Python version: that version used a small local Ollama
   model to break ties when the heuristic was unsure. We dropped local Ollama in
   the browser migration (mixed-content blocking), and the heuristic alone
   already covers the demo's intents reliably, so this module is heuristic-only
   — one fewer network call per message, and one fewer thing that can fail.
   ============================================================================ */

import * as memory from "./memory.js";
import * as connections from "./connections.js";
import { runTask, AIError } from "./aiCenter.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export async function handlePrompt(userPrompt, { priorDraft = null } = {}) {
  const prompt = (userPrompt || "").trim();
  const packet = memory.buildPacket(prompt);
  const { intent, params } = heuristicIntent(prompt, !!priorDraft);

  const result = { user_prompt: prompt, memory_packet: packet, intent };
  let aiMeta = { provider: null, model: null };

  try {
    if (intent === "calendar_query") {
      const events = connections.upcomingEvents(params.days);
      result.calendar = events;
      const r = await answer(prompt, packet, { calendar: events });
      result.apex_response = r.text;
      aiMeta = r;
    } else if (intent === "email_search") {
      const matches = connections.searchEmail(params.query || prompt);
      result.email_matches = matches;
      const r = await answer(prompt, packet, { emails: matches });
      result.apex_response = r.text;
      aiMeta = r;
    } else if (intent === "email_draft") {
      const { draft, matches, ai } = await draftEmail(prompt, params, packet, null);
      result.draft = draft;
      result.email_matches = matches;
      result.apex_response = "Here's a draft for you to review. Tell me what to change (tone, length, wording) and I'll adjust it.";
      aiMeta = ai;
    } else if (intent === "email_refine") {
      const learned = await learnStyle(prompt);
      const { draft, ai } = await draftEmail(prompt, params, packet, priorDraft);
      result.draft = draft;
      result.style_learned = learned;
      result.apex_response = "Updated the draft and noted your preference for next time. Anything else to tweak?";
      aiMeta = ai;
    } else {
      const r = await answer(prompt, packet, {});
      result.apex_response = r.text;
      aiMeta = r;
    }
  } catch (e) {
    if (e instanceof AIError) {
      result.apex_response = memoryOnlyFallback(packet, e.message);
    } else {
      throw e;
    }
  }

  result.ai_meta = aiMeta;
  memory.reviewInteraction(prompt, result.apex_response || "");
  return result;
}

/* ---- intent heuristic (regex rules, ported from pipeline.py:_heuristic_intent) --- */

function heuristicIntent(prompt, hasPriorDraft) {
  const p = prompt.toLowerCase();
  let days = 7;
  if (p.includes("today")) days = 1;
  else if (p.includes("tomorrow")) days = 2;
  else if (p.includes("week")) days = 7;

  const params = { days, query: searchQuery(prompt) };

  const refineWords = ["change", "shorter", "longer", "make it", "instead", "tone", "reword", "tweak", "more formal", "less formal"];
  if (hasPriorDraft && refineWords.some((w) => p.includes(w))) return { intent: "email_refine", params };

  const draftWords = ["draft", "reply", "respond", "write an email", "compose", "resend", "follow up"];
  if (draftWords.some((w) => p.includes(w))) return { intent: "email_draft", params };

  if ((p.includes("email") || p.includes("inbox")) && ["find", "search", "look for", "show"].some((w) => p.includes(w))) {
    return { intent: "email_search", params };
  }
  const calWords = ["calendar", "schedule", "agenda", "appointment", "meeting"];
  const askingToday = p.includes("today") && ["anything", "what", "have", "do i"].some((w) => p.includes(w));
  if (calWords.some((w) => p.includes(w)) || askingToday) return { intent: "calendar_query", params };

  return { intent: "chat", params };
}

function searchQuery(prompt) {
  const stop = new Set(["find", "the", "old", "email", "emails", "that", "about", "a", "an", "for", "to", "me", "my",
    "and", "help", "draft", "resend", "please", "can", "you", "from", "with", "of", "in", "on", "search", "look", "show"]);
  const words = (prompt.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !stop.has(w) && w.length > 2);
  return words.slice(0, 6).join(" ");
}

/* ---- answering (chat / calendar / email_search) -------------------------------- */

async function answer(prompt, packet, { calendar, emails } = {}) {
  const system = systemBase() + "\n\n" + contextBlock(packet, { calendar, emails });
  const r = await runTask("user_answer", [{ role: "system", content: system }, { role: "user", content: prompt }]);
  return { text: r.text, provider: r.provider, model: r.model };
}

/* ---- drafting + style learning --------------------------------------------- */

async function draftEmail(prompt, params, packet, priorDraft) {
  const matches = params.query ? connections.searchEmail(params.query) : [];
  const ref = matches[0] || null;

  const to = pickRecipient(ref, priorDraft);
  const subject = pickSubject(ref, priorDraft);
  const style = memory.writingStyleBrief();

  const system = systemBase() +
    "\n\nYou are drafting an email on the user's behalf. Write ONLY the email body " +
    "(no subject line, no commentary). Writing style to follow: " + style +
    "\n\n" + contextBlock(packet, { emails: matches });

  let instruction = prompt;
  if (priorDraft) {
    instruction = `Revise this previous draft based on the feedback.\n\nPREVIOUS DRAFT:\n${priorDraft.body || ""}\n\nFEEDBACK: ${prompt}`;
  }

  const r = await runTask("user_answer", [{ role: "system", content: system }, { role: "user", content: instruction }]);
  const draft = connections.createDraft({
    to, subject, body: cleanDraftBody(r.text),
    accountId: (ref || {}).account_id, inReplyTo: (ref || {}).id,
  });
  return { draft, matches, ai: { provider: r.provider, model: r.model } };
}

async function learnStyle(feedback) {
  try {
    const system = { role: "system", content:
      "The user gave feedback on an email draft. Express the lasting WRITING PREFERENCE it implies " +
      "as one short imperative sentence (e.g. 'Keep emails shorter and more direct.'). Reply with ONLY that sentence." };
    const r = await runTask("extract_style", [system, { role: "user", content: feedback }]);
    const pref = (r.text || "").trim().split("\n")[0].trim();
    if (pref) {
      memory.addStylePreference(pref, "user_feedback");
      return pref;
    }
  } catch (e) {
    // best-effort — a failed style-learning call shouldn't break the draft refine
  }
  return null;
}

const PREAMBLE_LINE_RE = /^\s*(here'?s|here is|sure|okay|got it)\b.*:\s*$/i;
// Some models prepend a chatty multi-sentence intro before the actual marker line
// (e.g. "I found the email... Here's a draft email:\n\n<body>") rather than putting
// the marker on its own first line. This catches that broader case.
const PREAMBLE_MARKER_RE = /^[\s\S]*?\b(here'?s|here is)\b[^\n]*\b(draft|email)\b[^\n]*:\s*\n+/i;

function cleanDraftBody(text) {
  let t = (text || "").trim();
  const marker = PREAMBLE_MARKER_RE.exec(t);
  if (marker) {
    return t.slice(marker[0].length).trim();
  }
  const lines = t.split("\n");
  if (lines.length && PREAMBLE_LINE_RE.test(lines[0])) lines.shift();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join("\n").trim();
}

function pickRecipient(ref, priorDraft) {
  if (priorDraft?.to) return priorDraft.to;
  if (ref) {
    const m = EMAIL_RE.exec(ref.body || "") || EMAIL_RE.exec(ref.sender || "");
    if (m) return m[0];
  }
  return "";
}

function pickSubject(ref, priorDraft) {
  if (priorDraft?.subject) return priorDraft.subject;
  if (ref) return ref.subject.toLowerCase().startsWith("re:") ? ref.subject : `Re: ${ref.subject}`;
  return "(no subject)";
}

/* ---- prompt building blocks -------------------------------------------------- */

function systemBase() {
  const p = memory.profileSummary();
  const tone = p.tone || "warm-professional";
  return `You are A.P.E.X. (Adaptive Personal Executive Xpert), the user's personal assistant. ` +
    `Speak as one assistant, ${tone} in tone. Be concise and genuinely helpful. ` +
    `Use the CONTEXT below when relevant; do not invent facts that aren't given.`;
}

function contextBlock(packet, { calendar, emails } = {}) {
  const parts = ["CONTEXT:"];
  if (packet.memory_needed && packet.loaded_records?.length) {
    parts.push("Memory: " + JSON.stringify(packet.loaded_records));
  }
  if (calendar !== undefined) {
    parts.push(calendar.length
      ? "Calendar (upcoming):\n" + calendar.map((e) => `- ${e.title} (${e.start} to ${e.end})${e.location ? ` @ ${e.location}` : ""}`).join("\n")
      : "Calendar: no events in range.");
  }
  if (emails !== undefined) {
    parts.push(emails.length
      ? "Emails found:\n" + emails.map((m) => `- [${m.id}] from ${m.sender} | ${m.subject} | ${m.snippet}`).join("\n")
      : "Emails: no matches found.");
  }
  return parts.join("\n");
}

function memoryOnlyFallback(packet, err) {
  const base = "(A.P.E.X. — no AI brain reachable right now, showing memory only) ";
  if (packet.memory_needed && packet.loaded_records?.length) {
    const names = packet.loaded_records.map((r) => r.display_name).join(", ");
    return base + `Relevant memory: ${names}. (Add a Groq or Gemini key in Settings for full answers.)`;
  }
  return base + "I couldn't reach a model. Add a Groq or Gemini key in Settings, then try again.";
}
