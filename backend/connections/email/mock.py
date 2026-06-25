"""
mock.py — a fake inbox so email search + draft work end-to-end with no real account.

Includes a DocuSign email so the user's example flow works:
  "find that old DocuSign email and help me draft a resend".

Drafts are appended to core_memory/logs/email_drafts_log.jsonl. Nothing is ever sent.
"""

from __future__ import annotations

import json
from datetime import datetime

from .base import EmailConnector, EmailDraft, EmailMessage
from ...memory import paths

DRAFTS_LOG_FILE = paths.LOGS_DIR / "email_drafts_log.jsonl"


# A small, realistic sample inbox for the default mock account.
_SAMPLE: list[EmailMessage] = [
    EmailMessage(
        id="msg_docusign_001",
        account_id="gmail_personal",
        sender="DocuSign <dse@docusign.net>",
        subject="Please DocuSign: Lease Renewal Agreement 2026",
        snippet="You have received a document to review and sign...",
        body=("Hello,\n\nYou have received a document to review and sign: "
              "'Lease Renewal Agreement 2026' from Maple Street Properties "
              "(leasing@maplestreet.com). This envelope expired before it was completed.\n\n"
              "Regards,\nDocuSign on behalf of Maple Street Properties"),
        date="2026-05-02",
        unread=False,
    ),
    EmailMessage(
        id="msg_invoice_002",
        account_id="gmail_personal",
        sender="billing@webhost.com",
        subject="Your invoice for May is ready",
        snippet="Invoice #4821 totaling $24.00 is now available...",
        body="Invoice #4821 totaling $24.00 is now available. No action needed if autopay is on.",
        date="2026-06-18",
        unread=True,
    ),
    EmailMessage(
        id="msg_friend_003",
        account_id="gmail_personal",
        sender="Taylor <taylor@example.com>",
        subject="hiking this weekend?",
        snippet="Want to do the coast trail Saturday morning?",
        body="Hey! Want to do the coast trail Saturday morning? Let me know :)",
        date="2026-06-20",
        unread=True,
    ),
]


class MockEmailConnector(EmailConnector):
    def __init__(self, account_id: str = "gmail_personal"):
        self.account_id = account_id
        # only show sample messages for the seeded demo account; newly-added accounts
        # are empty until real OAuth is connected (so we don't fake their inbox).
        self._messages = [m for m in _SAMPLE if m.account_id == account_id]

    def list_recent(self, limit: int = 10) -> list[EmailMessage]:
        return sorted(self._messages, key=lambda m: m.date, reverse=True)[:limit]

    def search(self, query: str, limit: int = 10) -> list[EmailMessage]:
        terms = [t for t in query.lower().split() if t]
        scored = []
        for m in self._messages:
            hay = f"{m.sender} {m.subject} {m.body}".lower()
            score = sum(hay.count(t) for t in terms)
            if score:
                scored.append((score, m))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [m for _, m in scored[:limit]]

    def get(self, message_id: str) -> EmailMessage | None:
        return next((m for m in self._messages if m.id == message_id), None)

    def create_draft(self, draft: EmailDraft) -> EmailDraft:
        draft.id = f"draft_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        paths.LOGS_DIR.mkdir(parents=True, exist_ok=True)
        with open(DRAFTS_LOG_FILE, "a", encoding="utf-8") as f:
            entry = dict(draft.to_dict())
            entry["created_at"] = datetime.now().isoformat(timespec="seconds")
            entry["status"] = "mock_draft"  # never sent
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return draft
