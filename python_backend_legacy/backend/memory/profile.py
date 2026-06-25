"""
profile.py — safe access + append-only updates to the A.P.E.X. self-profile.

The self-profile (core_memory/apex_self/apex_profile.json) describes how A.P.E.X.
should behave. It must GROW by adding evidence, never be blindly overwritten.

`add_evidence()` is the only mutating helper: it appends a piece of evidence to a
trait, nudges that trait's confidence upward (capped), and records the change in
update_history. It never deletes or replaces existing evidence.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from . import paths

CONFIDENCE_CAP = 0.95
CONFIDENCE_STEP = 0.05


def load_profile() -> dict[str, Any]:
    """Load the A.P.E.X. self-profile."""
    with open(paths.PROFILE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def profile_summary() -> dict[str, Any]:
    """
    A compact, prompt-friendly view of the profile (no evidence/history noise).
    Useful later when injecting behavior guidance into the main AI prompt.
    """
    p = load_profile()
    return {
        "identity": p.get("identity", {}),
        "tone": p.get("tone", {}).get("value"),
        "humor_level": p.get("humor", {}).get("level"),
        "directness_level": p.get("directness", {}).get("level"),
        "detail_level": p.get("detail_level", {}).get("level"),
        "pacing": p.get("pacing", {}).get("value"),
        "communication_style": p.get("communication_style", {}).get("notes", []),
    }


def add_evidence(trait: str, note: str, by: str = "system", source: str = "") -> dict[str, Any]:
    """
    Append evidence to a trait and nudge its confidence up (append-only, logged).

    `trait` is a top-level key with an "evidence" list and "confidence" float
    (e.g. "humor", "directness", "tone"). Returns the updated profile.

    This writes the file back to disk. It does NOT overwrite trait values; it only
    appends evidence and adjusts confidence. Changing a trait's actual value is a
    separate, deliberate step left for the Reflection phase.
    """
    profile = load_profile()

    node = profile.get(trait)
    if not isinstance(node, dict) or "evidence" not in node:
        raise ValueError(f"Trait {trait!r} is not an evidence-bearing trait in the profile.")

    node["evidence"].append({
        "date": date.today().isoformat(),
        "note": note,
        "source": source or by,
    })
    node["confidence"] = min(CONFIDENCE_CAP, round(node.get("confidence", 0.0) + CONFIDENCE_STEP, 2))

    profile["last_updated"] = date.today().isoformat()
    profile.setdefault("update_history", []).append({
        "date": date.today().isoformat(),
        "change": f"Added evidence to '{trait}'; confidence -> {node['confidence']}.",
        "by": by,
    })

    _save_profile(profile)
    return profile


def _save_profile(profile: dict[str, Any]) -> None:
    with open(paths.PROFILE_FILE, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
        f.write("\n")


# ---------------------------------------------------------------------------
# Writing style (used for drafting emails/messages) — append-only learning
# ---------------------------------------------------------------------------

def load_writing_style() -> dict[str, Any]:
    """Load the learned writing style (tone, defaults, learned preferences)."""
    with open(paths.WRITING_STYLE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def writing_style_brief() -> str:
    """A compact, prompt-ready description of how A.P.E.X. should write."""
    s = load_writing_style()
    d = s.get("defaults", {})
    prefs = s.get("learned_preferences", [])
    parts = [
        f"Tone: {s.get('tone', 'friendly and professional')}.",
        f"Length: {d.get('length', 'concise')}, formality: {d.get('formality', 'medium')}.",
        f"Sign-off: '{d.get('sign_off', 'Thanks,')}'.",
    ]
    if prefs:
        parts.append("Learned preferences: " + "; ".join(p.get("preference", "") for p in prefs if p.get("preference")))
    return " ".join(parts)


def add_style_preference(preference: str, source: str = "user_feedback") -> dict[str, Any]:
    """Append one learned writing preference (append-only, logged)."""
    style = load_writing_style()
    style.setdefault("learned_preferences", []).append({
        "date": date.today().isoformat(),
        "preference": preference.strip(),
        "source": source,
    })
    style["last_updated"] = date.today().isoformat()
    style.setdefault("history", []).append({
        "date": date.today().isoformat(),
        "change": f"Added writing preference: {preference.strip()[:80]}",
        "by": source,
    })
    with open(paths.WRITING_STYLE_FILE, "w", encoding="utf-8") as f:
        json.dump(style, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return style
