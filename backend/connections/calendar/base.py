"""
base.py — the calendar connector interface (read-only for now).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CalendarEvent:
    id: str
    calendar_id: str
    title: str
    start: str          # ISO datetime
    end: str            # ISO datetime
    location: str = ""
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "calendar_id": self.calendar_id, "title": self.title,
            "start": self.start, "end": self.end, "location": self.location, "notes": self.notes,
        }


class CalendarConnector:
    """Interface — subclasses implement against mock data or a real provider."""

    def upcoming(self, days: int = 7) -> list[CalendarEvent]:
        raise NotImplementedError

    def list_events(self, start_iso: str, end_iso: str) -> list[CalendarEvent]:
        raise NotImplementedError
