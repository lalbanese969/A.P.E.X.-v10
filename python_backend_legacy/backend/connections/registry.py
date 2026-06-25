"""
registry.py — hand back the right connector for an account/calendar.

For now everything is 'mock'. When real connectors land (Phase C), this is the ONE place
that switches on account 'status'/'type' to return a live Gmail/Outlook/Google connector.
Callers (the pipeline, the server) never construct connectors directly.
"""

from __future__ import annotations

from . import accounts
from .calendar.mock import MockCalendarConnector
from .email.mock import MockEmailConnector


def email_connector(account_id: str | None = None):
    """Return an email connector for the given account (defaults to the first account)."""
    acct = accounts.get_account(account_id) if account_id else (accounts.list_accounts() or [None])[0]
    if not acct:
        return MockEmailConnector()  # empty-ish default
    # status == 'mock' for now; real types ('gmail'/'outlook') wired in Phase C
    return MockEmailConnector(account_id=acct["id"])


def calendar_connector(calendar_id: str | None = None):
    """Return a calendar connector (defaults to the first/primary calendar)."""
    cal = accounts.get_calendar(calendar_id) if calendar_id else (accounts.list_calendars() or [None])[0]
    if not cal:
        return MockCalendarConnector()
    return MockCalendarConnector(calendar_id=cal["id"])
