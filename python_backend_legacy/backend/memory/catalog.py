"""
catalog.py — load and scan the memory catalog (the table of contents).

The catalog holds small CARDS, not full memory. The resolver scans these cards to
decide which memory files are worth opening.
"""

from __future__ import annotations

import json
from typing import Any

from . import paths


def load_catalog() -> dict[str, Any]:
    """Load memory_catalog.json. Returns the whole catalog dict."""
    with open(paths.CATALOG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def iter_cards() -> list[dict[str, Any]]:
    """Return the list of catalog cards (skips private keys like _README)."""
    catalog = load_catalog()
    return list(catalog.get("cards", []))


def get_card(card_id: str) -> dict[str, Any] | None:
    """Find a single card by id, or None."""
    for card in iter_cards():
        if card.get("id") == card_id:
            return card
    return None


def load_record(card: dict[str, Any]) -> dict[str, Any]:
    """
    Open the full memory file a card points to.

    The card stores 'memory_file' relative to the repo root, e.g.
    'core_memory/people/example_person_taylor.json'.
    """
    file_path = paths.resolve(card["memory_file"])
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)
