"""
schemas.py — record templates + small helpers.

Keeps the *shape* of records in code (so we can generate/validate them) while the
authoritative human-readable docs live in core_memory/*/*_schema.json.

Pure standard library. No external dependencies.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Templates (blank records)
# ---------------------------------------------------------------------------

def new_person(person_id: str = "", display_name: str = "") -> dict[str, Any]:
    """Return a blank person record matching core_memory/people/person_schema.json."""
    return {
        "id": person_id,
        "type": "person",
        "display_name": display_name,
        "first_name": "",
        "middle_name": "",
        "last_name": "",
        "aliases": [],
        "relationship_to_user": "",
        "birthday": None,
        "important_dates": [],
        "preferences": {},
        "likes": [],
        "dislikes": [],
        "favorite_foods": [],
        "favorite_places": [],
        "hobbies": [],
        "gift_ideas": [],
        "important_notes": [],
        "conversation_notes": [],
        "confidence": 1.0,
        "source": "user",
        "last_updated": _today(),
    }


def new_project(project_id: str = "", display_name: str = "") -> dict[str, Any]:
    """Return a blank project record matching core_memory/projects/project_schema.json."""
    return {
        "id": project_id,
        "type": "project",
        "display_name": display_name,
        "status": "active",
        "summary": "",
        "goals": [],
        "components": [],
        "decisions": [],
        "open_questions": [],
        "tags": [],
        "confidence": 1.0,
        "source": "user",
        "last_updated": _today(),
    }


# Required keys for a minimally-valid record of each type.
REQUIRED_PERSON_KEYS = {"id", "type", "display_name"}
REQUIRED_PROJECT_KEYS = {"id", "type", "display_name"}


def validate_person(record: dict[str, Any]) -> list[str]:
    """Return a list of problems with a person record (empty list == OK)."""
    return _validate(record, REQUIRED_PERSON_KEYS, "person")


def validate_project(record: dict[str, Any]) -> list[str]:
    """Return a list of problems with a project record (empty list == OK)."""
    return _validate(record, REQUIRED_PROJECT_KEYS, "project")


def _validate(record: dict[str, Any], required: set[str], expected_type: str) -> list[str]:
    problems: list[str] = []
    for key in required:
        if not record.get(key):
            problems.append(f"missing required field: {key!r}")
    if record.get("type") not in (None, expected_type):
        problems.append(f"type should be {expected_type!r}, got {record.get('type')!r}")
    return problems


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_age(birthday: Optional[str], on: Optional[date] = None) -> Optional[int]:
    """
    Compute age in whole years from an ISO 'YYYY-MM-DD' birthday.

    Age is computed ON DEMAND so we never store a stale number. Returns None if
    the birthday is missing or unparseable.
    """
    if not birthday:
        return None
    try:
        bday = datetime.strptime(birthday, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    today = on or date.today()
    years = today.year - bday.year
    # subtract one if this year's birthday hasn't happened yet
    if (today.month, today.day) < (bday.month, bday.day):
        years -= 1
    return years


def _today() -> str:
    return date.today().isoformat()
