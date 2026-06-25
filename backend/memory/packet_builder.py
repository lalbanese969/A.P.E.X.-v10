"""
packet_builder.py — assemble the small Memory Packet for the main A.P.E.X. AI.

Flow:
    resolver.resolve()  ->  open only the matched records  ->  pull only the
    suggested sections  ->  return a compact JSON object.

The packet is deliberately small: it never contains the whole memory store, only
the slices relevant to the current prompt.
"""

from __future__ import annotations

from typing import Any, Optional

from . import catalog, resolver, schemas


# ---------------------------------------------------------------------------
# Section maps: section name -> which record fields to include.
# This is how we load ONLY part of a record instead of the whole thing.
# ---------------------------------------------------------------------------
_PERSON_SECTIONS: dict[str, list[str]] = {
    "identity":        ["display_name", "first_name", "middle_name", "last_name",
                        "aliases", "relationship_to_user"],
    "birthday":        ["birthday"],  # age is added dynamically below
    "important_dates": ["important_dates"],
    "preferences":     ["preferences"],
    "likes":           ["likes"],
    "dislikes":        ["dislikes"],
    "favorite_foods":  ["favorite_foods"],
    "favorite_places": ["favorite_places"],
    "hobbies":         ["hobbies"],
    "gift_ideas":      ["gift_ideas"],
    "important_notes": ["important_notes"],
    "conversation_notes": ["conversation_notes"],
}

_PROJECT_SECTIONS: dict[str, list[str]] = {
    "identity":       ["display_name", "status"],
    "status":         ["status"],
    "summary":        ["summary"],
    "goals":          ["goals"],
    "components":     ["components"],
    "decisions":      ["decisions"],
    "open_questions": ["open_questions"],
}

_SECTION_MAPS = {"person": _PERSON_SECTIONS, "project": _PROJECT_SECTIONS}


def build_packet(prompt: str, session_context: Optional[str] = None) -> dict[str, Any]:
    """
    Build the Memory Packet for a prompt.

    Returns:
        {
          "memory_needed": bool,
          "query": <prompt>,
          "loaded_records": [
            { "id", "type", "display_name", "relationship_to_user",
              "sections_loaded": [...], "summary": { ...only-loaded-sections... } }
          ]
        }
    """
    candidates = resolver.resolve(prompt, session_context=session_context)

    if not candidates:
        return {"memory_needed": False, "query": prompt, "loaded_records": []}

    loaded_records: list[dict[str, Any]] = []
    for cand in candidates:
        card = cand["card"]
        record = catalog.load_record(card)
        sections = cand["suggested_sections"]

        summary = _extract_sections(record, card.get("type"), sections)

        loaded_records.append({
            "id": card.get("id"),
            "type": card.get("type"),
            "display_name": card.get("display_name"),
            "relationship_to_user": card.get("relationship_to_user"),
            "sections_loaded": [s for s in sections if s in summary],
            "summary": summary,
            "_match": {"score": cand["score"], "matched_on": cand["matched_on"]},
        })

    return {"memory_needed": True, "query": prompt, "loaded_records": loaded_records}


def _extract_sections(
    record: dict[str, Any],
    record_type: Optional[str],
    sections: list[str],
) -> dict[str, Any]:
    """Pull only the requested sections out of a full record into a small dict."""
    field_map = _SECTION_MAPS.get(record_type or "", {})
    out: dict[str, Any] = {}

    for section in sections:
        fields = field_map.get(section)
        if not fields:
            continue
        chunk = {f: record.get(f) for f in fields if record.get(f) not in (None, "", [], {})}

        # Birthday section: add a freshly-computed age (never stored stale).
        if section == "birthday" and record.get("birthday"):
            chunk["birthday"] = record["birthday"]
            chunk["age"] = schemas.compute_age(record["birthday"])

        if chunk:
            out[section] = chunk

    return out
