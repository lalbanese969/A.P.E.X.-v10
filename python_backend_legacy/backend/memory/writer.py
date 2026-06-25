"""
writer.py — Memory Writer PLACEHOLDER (V1).

This is the stub for the future "Memory Writer AI". For now it does NOT call any
AI and NEVER edits memory records. It only:
    1. Looks at a finished interaction (user prompt + assistant response).
    2. Uses light rule-based detection to GUESS whether something might be worth
       saving (people, birthdays, preferences, gift ideas, notes...).
    3. Appends each guess as a PROPOSED write to
       core_memory/logs/memory_write_log.jsonl for human review.

Real extraction + an approval step come in a later phase. The interface
(`review_interaction`) is meant to stay stable so the brain can be swapped in
without changing callers.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from . import paths


# Simple patterns -> candidate memory writes. Intentionally conservative.
_PATTERNS: list[dict[str, Any]] = [
    {
        "kind": "explicit_remember",
        "regex": re.compile(r"\bremember that\b(.+)", re.IGNORECASE),
        "note": "User explicitly asked to remember something.",
    },
    {
        "kind": "birthday",
        "regex": re.compile(r"\b(?:my|her|his|their)?\s*birthday is\b(.+)", re.IGNORECASE),
        "note": "Possible birthday fact.",
    },
    {
        "kind": "preference_like",
        "regex": re.compile(r"\b(\w+) (?:likes|loves|enjoys|prefers)\b(.+)", re.IGNORECASE),
        "note": "Possible preference/like.",
    },
    {
        "kind": "preference_dislike",
        "regex": re.compile(r"\b(\w+) (?:dislikes|hates|can't stand)\b(.+)", re.IGNORECASE),
        "note": "Possible dislike.",
    },
    {
        "kind": "gift_idea",
        "regex": re.compile(r"\bgift idea\b(.+)|\bwould (?:love|like|want)\b(.+)", re.IGNORECASE),
        "note": "Possible gift idea.",
    },
]


def review_interaction(user_prompt: str, assistant_response: str = "") -> dict[str, Any]:
    """
    Inspect one interaction and propose (but do NOT perform) memory writes.

    Returns:
        { "should_write": bool, "candidates": [ {kind, note, snippet, source}, ... ] }

    Side effect: appends each candidate to memory_write_log.jsonl.
    """
    candidates: list[dict[str, Any]] = []

    for pat in _PATTERNS:
        match = pat["regex"].search(user_prompt or "")
        if match:
            snippet = next((g for g in match.groups() if g), match.group(0)).strip()
            candidates.append({
                "kind": pat["kind"],
                "note": pat["note"],
                "snippet": snippet,
                "source": "user_prompt",
            })

    result = {"should_write": bool(candidates), "candidates": candidates}

    if candidates:
        _log_candidates(user_prompt, assistant_response, candidates)

    return result


def _log_candidates(
    user_prompt: str,
    assistant_response: str,
    candidates: list[dict[str, Any]],
) -> None:
    """Append one JSON line per proposed write. Creates the log file if missing."""
    paths.LOGS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat(timespec="seconds")

    with open(paths.WRITE_LOG_FILE, "a", encoding="utf-8") as f:
        for cand in candidates:
            entry = {
                "timestamp": timestamp,
                "status": "proposed",          # nothing is auto-applied in V1
                "kind": cand["kind"],
                "note": cand["note"],
                "snippet": cand["snippet"],
                "user_prompt": user_prompt,
                "assistant_response": assistant_response,
            }
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
