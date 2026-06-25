"""
models.py — resolve which provider + model handles a task, from config/ai_center.json.

Routing config shape:
  user_answer : { provider, model }            -> the user-facing answer
  internal    : { provider, tiers:{small,...} } -> internal tasks by complexity tier
  fallback_provider : "ollama"                  -> used if the chosen provider is down
  ollama_tiers / gemini_model                   -> models for those providers when used
"""

from __future__ import annotations

from . import config


def user_answer_cfg() -> tuple[str, str]:
    """(provider, model) for the user-facing answer."""
    ua = config.load_ai_config().get("user_answer", {})
    return ua.get("provider", "groq"), ua.get("model", "llama-3.3-70b-versatile")


def internal_cfg() -> tuple[str, dict]:
    """(provider, tiers-dict) for internal tasks."""
    ic = config.load_ai_config().get("internal", {})
    return ic.get("provider", "groq"), ic.get("tiers", {})


def fallback_provider() -> str:
    return config.load_ai_config().get("fallback_provider", "ollama")


def gemini_model() -> str:
    return config.load_ai_config().get("gemini_model", "gemini-2.0-flash")


def ollama_model_for(tier: str) -> str:
    """Configured Ollama model for a complexity tier (used when Ollama is the provider/fallback)."""
    cfg = config.load_ai_config()
    tiers = cfg.get("ollama_tiers", {})
    if tier in tiers:
        return tiers[tier]
    default_tier = cfg.get("default_internal_tier", "small")
    return tiers.get(default_tier) or next(iter(tiers.values()), "llama3.2:3b")
