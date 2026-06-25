"""
resolver.py — decide WHICH memory is relevant to a prompt, and WHICH sections to load.

V1 strategy (intentionally simple, no embeddings):
    score each catalog card by overlap between the prompt and the card's
    aliases / display_name / relationship / tags / summary_card.

This is a clearly-labeled STAND-IN for future semantic search. The function
signature and return shape are designed to stay the same when we later swap the
scorer for real embeddings — callers won't need to change.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from . import catalog


# ---------------------------------------------------------------------------
# Scoring weights — tweak the resolver's "feel" here.
# ---------------------------------------------------------------------------
W_DISPLAY_NAME = 5.0   # prompt mentions the card's display name
W_ALIAS        = 5.0   # prompt mentions an alias (incl. phrases like "my girlfriend")
W_RELATIONSHIP = 4.0   # prompt mentions the relationship word
W_TAG          = 2.0   # prompt word matches a tag
W_SUMMARY      = 1.0   # prompt word appears in the summary card

# How relevant a card must be to make it into the candidate list.
MIN_SCORE = 1.0


# Maps prompt keywords -> memory section names. Used to load ONLY relevant
# sections instead of the whole record. Sections are intersected with each
# card's "available_sections", and "identity" is always included.
_SECTION_KEYWORDS: dict[str, list[str]] = {
    "birthday":        ["birthday", "born", "age", "old", "how old"],
    "gift_ideas":      ["gift", "present", "buy", "get her", "get him", "get them", "birthday"],
    "preferences":     ["prefer", "preference", "like", "likes", "favorite", "favourite"],
    "likes":           ["like", "likes", "into", "enjoy"],
    "dislikes":        ["dislike", "hate", "hates", "avoid"],
    "favorite_foods":  ["food", "eat", "restaurant", "dinner", "lunch", "sushi"],
    "hobbies":         ["hobby", "hobbies", "does for fun", "free time"],
    "important_notes": ["allergy", "allergic", "note", "important", "remember"],
    "goals":           ["goal", "goals", "trying to", "aim"],
    "status":          ["status", "progress", "where are we"],
    "components":      ["component", "parts", "subsystem", "modules"],
    "decisions":       ["decision", "decided", "chose"],
    "open_questions":  ["open question", "undecided", "question"],
}

# Default sections to load when no keyword matched (keeps the packet small but useful).
_DEFAULT_SECTIONS = ["identity", "preferences", "summary", "status", "goals"]


def _tokens(text: str) -> list[str]:
    """Lowercase word tokens, punctuation stripped."""
    return re.findall(r"[a-z0-9']+", (text or "").lower())


def resolve(
    prompt: str,
    session_context: Optional[str] = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """
    Find likely-relevant memory records for a prompt.

    Returns a ranked list of candidates, each:
        {
          "card": <the catalog card>,
          "score": <float>,
          "matched_on": [<reasons>],
          "suggested_sections": [<section names to load>]
        }

    session_context (optional recent conversation text) is appended to the prompt
    so follow-up questions ("how old is she?") can still match.
    """
    haystack = f"{prompt} {session_context or ''}"
    prompt_tokens = set(_tokens(haystack))
    prompt_lower = haystack.lower()
    # Punctuation-collapsed form, so dotted acronyms like "A.P.E.X." match "apex".
    prompt_collapsed = re.sub(r"[^a-z0-9]+", "", prompt_lower)

    candidates: list[dict[str, Any]] = []

    for card in catalog.iter_cards():
        score = 0.0
        matched_on: list[str] = []

        # display name
        if _phrase_in(card.get("display_name", ""), prompt_lower, prompt_tokens, prompt_collapsed):
            score += W_DISPLAY_NAME
            matched_on.append(f"name:{card.get('display_name')}")

        # aliases (support multi-word phrases like "my girlfriend")
        for alias in card.get("aliases", []):
            if _phrase_in(alias, prompt_lower, prompt_tokens, prompt_collapsed):
                score += W_ALIAS
                matched_on.append(f"alias:{alias}")
                break

        # relationship word
        rel = card.get("relationship_to_user")
        if rel and _phrase_in(rel, prompt_lower, prompt_tokens, prompt_collapsed):
            score += W_RELATIONSHIP
            matched_on.append(f"relationship:{rel}")

        # tags
        for tag in card.get("tags", []):
            if tag.lower() in prompt_tokens:
                score += W_TAG
                matched_on.append(f"tag:{tag}")

        # summary word overlap
        summary_tokens = set(_tokens(card.get("summary_card", "")))
        overlap = prompt_tokens & summary_tokens
        # ignore tiny stopword-ish overlaps by requiring length > 3
        meaningful = {w for w in overlap if len(w) > 3}
        if meaningful:
            score += W_SUMMARY * len(meaningful)
            matched_on.append(f"summary:{','.join(sorted(meaningful))}")

        if score >= MIN_SCORE:
            candidates.append({
                "card": card,
                "score": round(score, 2),
                "matched_on": matched_on,
                "suggested_sections": _suggest_sections(prompt_lower, card),
            })

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates[:limit]


def _phrase_in(phrase: str, prompt_lower: str, prompt_tokens: set[str], prompt_collapsed: str = "") -> bool:
    """
    True if `phrase` is present.
      - multi-word phrase -> substring match
      - single word       -> exact token match
      - fallback          -> punctuation-collapsed substring (len >= 4), so
                             "A.P.E.X."/"apex" match each other without firing on
                             short aliases like "Tay".
    """
    if not phrase:
        return False
    phrase = phrase.lower().strip()
    if " " in phrase:
        if phrase in prompt_lower:
            return True
    elif phrase in prompt_tokens:
        return True

    collapsed = re.sub(r"[^a-z0-9]+", "", phrase)
    if prompt_collapsed and len(collapsed) >= 4 and collapsed in prompt_collapsed:
        return True
    return False


def _suggest_sections(prompt_lower: str, card: dict[str, Any]) -> list[str]:
    """Pick which sections to load based on prompt keywords, bounded to the card's available ones."""
    available = set(card.get("available_sections", []))
    chosen: list[str] = ["identity"] if "identity" in available else []

    for section, keywords in _SECTION_KEYWORDS.items():
        if section not in available:
            continue
        if any(kw in prompt_lower for kw in keywords):
            if section not in chosen:
                chosen.append(section)

    # Fallback: if nothing matched beyond identity, load a small default set.
    if len(chosen) <= 1:
        for section in _DEFAULT_SECTIONS:
            if section in available and section not in chosen:
                chosen.append(section)

    return chosen
