"""
accounts.py — load the labeled account/calendar registry from config/accounts.json.

Labels and purposes are NOT secret and live in config. Real tokens (later) live in
secrets/secrets.json keyed by account id.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
ACCOUNTS_FILE = REPO_ROOT / "config" / "accounts.json"

_FALLBACK = {"accounts": [], "calendars": []}


def _load() -> dict[str, Any]:
    if ACCOUNTS_FILE.exists():
        try:
            return json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return dict(_FALLBACK)


def list_accounts() -> list[dict[str, Any]]:
    """All email accounts (with labels/purpose/status)."""
    return list(_load().get("accounts", []))


def list_calendars() -> list[dict[str, Any]]:
    """All calendars."""
    return list(_load().get("calendars", []))


def get_account(account_id: str) -> dict[str, Any] | None:
    for a in list_accounts():
        if a.get("id") == account_id:
            return a
    return None


def get_calendar(calendar_id: str) -> dict[str, Any] | None:
    for c in list_calendars():
        if c.get("id") == calendar_id:
            return c
    return None
