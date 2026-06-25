"""
mock.py — a fake calendar with events generated relative to TODAY, so the calendar
view and "anything on my calendar today?" always have realistic data.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from .base import CalendarConnector, CalendarEvent


def _at(day_offset: int, hour: int, minute: int = 0) -> str:
    d = datetime.combine(date.today() + timedelta(days=day_offset), datetime.min.time())
    return d.replace(hour=hour, minute=minute).isoformat(timespec="minutes")


class MockCalendarConnector(CalendarConnector):
    def __init__(self, calendar_id: str = "gcal_primary"):
        self.calendar_id = calendar_id

    def _all(self) -> list[CalendarEvent]:
        cid = self.calendar_id
        return [
            CalendarEvent("evt_today_1", cid, "Dentist appointment", _at(0, 14, 0), _at(0, 15, 0),
                          location="Downtown Dental"),
            CalendarEvent("evt_today_2", cid, "Dinner with Taylor", _at(0, 18, 30), _at(0, 20, 0),
                          location="Sushi place"),
            CalendarEvent("evt_tom_1", cid, "Team standup", _at(1, 9, 30), _at(1, 10, 0),
                          notes="Weekly sync"),
            CalendarEvent("evt_d2_1", cid, "Project deadline: APEX demo", _at(2, 17, 0), _at(2, 17, 30)),
            CalendarEvent("evt_d4_1", cid, "Hiking - coast trail", _at(4, 8, 0), _at(4, 12, 0),
                          location="Coast trailhead"),
        ]

    def upcoming(self, days: int = 7) -> list[CalendarEvent]:
        cutoff = datetime.combine(date.today() + timedelta(days=days), datetime.max.time())
        now = datetime.now()
        out = []
        for e in self._all():
            start = datetime.fromisoformat(e.start)
            if now <= start <= cutoff or start.date() == date.today():
                out.append(e)
        return sorted(out, key=lambda e: e.start)

    def list_events(self, start_iso: str, end_iso: str) -> list[CalendarEvent]:
        start = datetime.fromisoformat(start_iso)
        end = datetime.fromisoformat(end_iso)
        return sorted(
            [e for e in self._all() if start <= datetime.fromisoformat(e.start) <= end],
            key=lambda e: e.start,
        )
