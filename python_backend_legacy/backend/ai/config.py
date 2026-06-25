"""
config.py — load AI Center config + secrets.

Two sources, kept separate on purpose:
  - config/ai_center.json   : non-secret, hand-editable (model names, host, budgets).
  - secrets/secrets.json    : secret (Gemini API key, cloud-Ollama auth). Git-ignored.

If secrets/secrets.json is missing we fall back to secrets.example.json values (all blank),
so the system still runs (and simply has no Gemini key).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# <repo>/backend/ai/config.py -> parents[2] = repo root
REPO_ROOT = Path(__file__).resolve().parents[2]

AI_CONFIG_FILE      = REPO_ROOT / "config" / "ai_center.json"
SECRETS_FILE        = REPO_ROOT / "secrets" / "secrets.json"
SECRETS_EXAMPLE     = REPO_ROOT / "secrets" / "secrets.example.json"


# ---- defaults used if config/ai_center.json is absent ----------------------
# Provider-based routing: pick a provider per task type. Groq (fast, free-tier cloud)
# is the default brain; Ollama (local) is the fallback when a provider is unreachable.
_DEFAULT_CONFIG: dict[str, Any] = {
    "user_answer": {"provider": "groq", "model": "llama-3.3-70b-versatile"},
    "internal": {
        "provider": "groq",
        "tiers": {"small": "llama-3.1-8b-instant", "medium": "llama-3.1-8b-instant",
                  "large": "llama-3.3-70b-versatile"},
    },
    "fallback_provider": "ollama",
    "gemini_model": "gemini-2.0-flash",
    # NOTE: use 127.0.0.1, not "localhost" — Python's urllib resolves "localhost" to ~2s on
    # some Windows machines (vs ~40ms for 127.0.0.1), which made the Settings page slow.
    "ollama_host": "http://127.0.0.1:11434",
    "ollama_auth_header": None,
    "ollama_tiers": {"small": "llama3.2:3b", "medium": "llama3.1:8b", "large": "qwen2.5:14b"},
    "default_internal_tier": "small",
}


def load_ai_config() -> dict[str, Any]:
    """Load config/ai_center.json, falling back to sane defaults."""
    if AI_CONFIG_FILE.exists():
        try:
            cfg = json.loads(AI_CONFIG_FILE.read_text(encoding="utf-8"))
            # shallow-merge over defaults so missing keys are still present
            merged = dict(_DEFAULT_CONFIG)
            merged.update(cfg)
            return merged
        except Exception:
            pass
    return dict(_DEFAULT_CONFIG)


def load_secrets() -> dict[str, Any]:
    """Load secrets/secrets.json, falling back to the (blank) example template."""
    for path in (SECRETS_FILE, SECRETS_EXAMPLE):
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
    return {}


def _provider_key(name: str, env_var: str) -> str:
    """Read an API key: env var first (for cloud hosts), then secrets.json."""
    env = os.environ.get(env_var, "").strip()
    if env:
        return env
    return (load_secrets().get("ai_providers", {}) or {}).get(name, "") or ""


def gemini_api_key() -> str:
    """Return the Gemini API key (env GEMINI_API_KEY or secrets), or '' if unset."""
    return _provider_key("gemini_api_key", "GEMINI_API_KEY")


def groq_api_key() -> str:
    """Return the Groq API key (env GROQ_API_KEY or secrets), or '' if unset."""
    return _provider_key("groq_api_key", "GROQ_API_KEY")


def ollama_settings() -> tuple[str, str | None]:
    """Return (host, auth_header) for Ollama from config; auth_header may be None."""
    cfg = load_ai_config()
    return cfg.get("ollama_host", _DEFAULT_CONFIG["ollama_host"]), cfg.get("ollama_auth_header")
