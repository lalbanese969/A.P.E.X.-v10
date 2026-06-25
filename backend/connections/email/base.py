"""
base.py — the email connector interface every backend (mock, Gmail, Outlook) implements.

Reactive scope for now: read/search + create_draft. No sending (that's a later, gated step).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class EmailMessage:
    id: str
    account_id: str
    sender: str
    subject: str
    snippet: str
    body: str
    date: str            # ISO date
    unread: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "account_id": self.account_id, "sender": self.sender,
            "subject": self.subject, "snippet": self.snippet, "body": self.body,
            "date": self.date, "unread": self.unread,
        }


@dataclass
class EmailDraft:
    to: str
    subject: str
    body: str
    account_id: str
    in_reply_to: str | None = None      # message id this draft responds to
    id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "to": self.to, "subject": self.subject, "body": self.body,
            "account_id": self.account_id, "in_reply_to": self.in_reply_to,
        }


class EmailConnector:
    """Interface — subclasses implement against mock data or a real provider."""

    def list_recent(self, limit: int = 10) -> list[EmailMessage]:
        raise NotImplementedError

    def search(self, query: str, limit: int = 10) -> list[EmailMessage]:
        raise NotImplementedError

    def get(self, message_id: str) -> EmailMessage | None:
        raise NotImplementedError

    def create_draft(self, draft: EmailDraft) -> EmailDraft:
        """Persist a draft (mock: store/log it). Never sends."""
        raise NotImplementedError
