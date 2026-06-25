"""
settings.py — read/write the user-editable settings shown on the Settings page.

Three backing files:
  - config/ai_center.json      (non-secret AI Center config)
  - config/accounts.json       (non-secret account labels/purposes)
  - secrets/secrets.json       (SECRET — Gemini key). Created from the example if missing.

Safety:
  - Secret VALUES are never returned to the UI (only a boolean "is it set").
  - Unknown/extra keys in the files are preserved on save (we patch known fields only).
  - A blank Gemini key submission does NOT wipe an existing key.
"""

from __future__ import annotations

import json
import re
from typing import Any

_VALID_TYPES = {"gmail", "outlook"}

from .ai import config as ai_config
from .ai.center import AICenter
from .connections import accounts as accounts_mod

# allowed top-level keys we let the UI edit in ai_center.json
_AI_SCALAR_KEYS = {"ollama_host", "ollama_auth_header", "fallback_to_ollama", "default_internal_tier"}


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_settings() -> dict[str, Any]:
    """Everything the Settings page needs (no secret values)."""
    cfg = ai_config.load_ai_config()
    center = AICenter()
    return {
        "ai_center": {
            "user_answer": cfg.get("user_answer", {}),
            "ollama_host": cfg.get("ollama_host"),
            "ollama_auth_header_set": bool(cfg.get("ollama_auth_header")),
            "ollama_tiers": cfg.get("ollama_tiers", {}),
            "fallback_to_ollama": cfg.get("fallback_to_ollama", True),
            "default_internal_tier": cfg.get("default_internal_tier", "small"),
        },
        "gemini_key_set": center.gemini.available(),
        "ollama_reachable": center.ollama.available(),
        "installed_models": center.ollama.available_models(),
        "accounts": accounts_mod.list_accounts(),
        "calendars": accounts_mod.list_calendars(),
    }


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def update_settings(patch: dict[str, Any]) -> dict[str, Any]:
    """
    Apply a settings patch. Recognized keys:
      - ai_center: { user_answer:{model,max_calls_per_turn,provider}, ollama_host,
                     ollama_auth_header, ollama_tiers:{small,medium,large},
                     fallback_to_ollama, default_internal_tier }
      - gemini_api_key: "..."   (written to secrets; blank is ignored)
      - accounts: [ {id, label, purpose} ]   (label/purpose updates by id)
    Returns the fresh get_settings().
    """
    if "ai_center" in patch and isinstance(patch["ai_center"], dict):
        _update_ai_center(patch["ai_center"])
    if patch.get("gemini_api_key"):
        _set_gemini_key(patch["gemini_api_key"].strip())
    if "accounts" in patch and isinstance(patch["accounts"], list):
        _update_account_labels(patch["accounts"])
    if isinstance(patch.get("add_account"), dict):
        _add_account(patch["add_account"])
    if patch.get("remove_account_id"):
        _remove_account(patch["remove_account_id"])
    return get_settings()


def _add_account(spec: dict[str, Any]) -> None:
    """Append a new email account (status 'not_connected' until OAuth is wired up)."""
    data = _load_json(accounts_mod.ACCOUNTS_FILE, default={"accounts": [], "calendars": []})
    typ = (spec.get("type") or "gmail").lower()
    if typ not in _VALID_TYPES:
        typ = "gmail"
    address = (spec.get("address") or "").strip()
    label = (spec.get("label") or address or typ).strip()
    purpose = (spec.get("purpose") or "").strip()

    # build a unique id from type + email local-part
    local = re.sub(r"[^a-z0-9]+", "_", address.split("@")[0].lower()) if address else "account"
    base = f"{typ}_{local}"
    existing = {a.get("id") for a in data.get("accounts", [])}
    aid, n = base, 2
    while aid in existing:
        aid, n = f"{base}_{n}", n + 1

    data.setdefault("accounts", []).append({
        "id": aid, "label": label, "type": typ, "address": address,
        "purpose": purpose, "status": "not_connected",
    })
    _save_json(accounts_mod.ACCOUNTS_FILE, data)


def _remove_account(account_id: str) -> None:
    data = _load_json(accounts_mod.ACCOUNTS_FILE, default={"accounts": [], "calendars": []})
    data["accounts"] = [a for a in data.get("accounts", []) if a.get("id") != account_id]
    _save_json(accounts_mod.ACCOUNTS_FILE, data)


def _update_ai_center(patch: dict[str, Any]) -> None:
    cfg = _load_json(ai_config.AI_CONFIG_FILE, default={})
    for k in _AI_SCALAR_KEYS:
        if k in patch:
            cfg[k] = patch[k]
    if isinstance(patch.get("user_answer"), dict):
        ua = cfg.setdefault("user_answer", {})
        for k in ("provider", "model", "max_calls_per_turn"):
            if k in patch["user_answer"]:
                ua[k] = patch["user_answer"][k]
    if isinstance(patch.get("ollama_tiers"), dict):
        tiers = cfg.setdefault("ollama_tiers", {})
        for k in ("small", "medium", "large"):
            if patch["ollama_tiers"].get(k):
                tiers[k] = patch["ollama_tiers"][k]
    _save_json(ai_config.AI_CONFIG_FILE, cfg)


def _set_gemini_key(key: str) -> None:
    """Write the Gemini key into secrets.json (created from the example if missing)."""
    secrets = _load_json(ai_config.SECRETS_FILE, default=None)
    if secrets is None:
        secrets = _load_json(ai_config.SECRETS_EXAMPLE, default={}) or {}
    secrets.setdefault("ai_providers", {})["gemini_api_key"] = key
    ai_config.SECRETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _save_json(ai_config.SECRETS_FILE, secrets)


def _update_account_labels(updates: list[dict[str, Any]]) -> None:
    data = _load_json(accounts_mod.ACCOUNTS_FILE, default={"accounts": [], "calendars": []})
    by_id = {u.get("id"): u for u in updates if u.get("id")}
    for acct in data.get("accounts", []):
        u = by_id.get(acct.get("id"))
        if u:
            if "label" in u:
                acct["label"] = u["label"]
            if "purpose" in u:
                acct["purpose"] = u["purpose"]
    _save_json(accounts_mod.ACCOUNTS_FILE, data)


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

def _load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _save_json(path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
