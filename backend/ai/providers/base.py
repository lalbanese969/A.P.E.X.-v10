"""
base.py — the common Provider interface every brain implements.

A Provider takes a list of chat messages and returns text. Keeping this tiny means
Ollama and Gemini (and any future provider) are interchangeable to the AI Center.

Message format (provider-agnostic):
    [{"role": "system"|"user"|"assistant", "content": "..."}]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class ProviderError(Exception):
    """Raised when a provider can't produce a result (offline, no key, bad response)."""


@dataclass
class ProviderResult:
    """What every provider returns."""
    text: str
    provider: str
    model: str
    usage: dict[str, Any] = field(default_factory=dict)  # token counts if available


class Provider:
    """Base class — subclasses implement generate()."""

    name: str = "base"

    def generate(self, messages: list[dict[str, str]], model: str, **opts) -> ProviderResult:
        raise NotImplementedError

    def available(self) -> bool:
        """Quick best-effort check of whether this provider can be used right now."""
        return True
