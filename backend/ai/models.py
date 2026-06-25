"""
models.py — map a complexity tier ("small"/"medium"/"large") to a concrete Ollama
model name, using config/ai_center.json. Centralizes the "which model" decision so
the AI Center stays about routing, not model names.
"""

from __future__ import annotations

from . import config


def ollama_model_for(tier: str) -> str:
    """Return the configured Ollama model name for a complexity tier."""
    cfg = config.load_ai_config()
    tiers = cfg.get("ollama_tiers", {})
    if tier in tiers:
        return tiers[tier]
    # fall back to the default internal tier, then to anything available
    default_tier = cfg.get("default_internal_tier", "small")
    if default_tier in tiers:
        return tiers[default_tier]
    return next(iter(tiers.values()), "llama3.2:3b")


def user_answer_model() -> tuple[str, str, int]:
    """Return (provider, model, max_calls_per_turn) for the user-facing answer."""
    cfg = config.load_ai_config()
    ua = cfg.get("user_answer", {})
    return (
        ua.get("provider", "gemini"),
        ua.get("model", "gemini-2.0-flash"),
        int(ua.get("max_calls_per_turn", 1)),
    )
