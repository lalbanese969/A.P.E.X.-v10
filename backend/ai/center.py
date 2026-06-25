"""
center.py — the AI Center: route each task to the right brain and log usage.

Routing rules (per the project's cost philosophy):
  - task_type "user_answer"  -> Gemini (PAID), used sparingly. A per-TURN budget guard
    caps Gemini calls (default 1, hard cap from config). Over budget / no key / offline
    -> fall back to a capable local Ollama model.
  - every other task_type     -> Ollama (FREE/local) at the requested complexity tier.

Usage:
    center = AICenter()
    sess = center.session()                 # one session per UI turn (tracks Gemini budget)
    answer = sess.run_task("user_answer", messages)        # Gemini (budgeted)
    label  = sess.run_task("classify", messages, "small")  # Ollama small

Each call returns a ProviderResult (.text, .provider, .model, .usage). Failures raise
ProviderError so callers can degrade gracefully.
"""

from __future__ import annotations

import json
import time
from datetime import datetime

from . import config, models
from .providers.base import ProviderError, ProviderResult
from .providers.gemini import GeminiProvider
from .providers.ollama import OllamaProvider

# reuse the memory module's logs directory
from ..memory import paths

USAGE_LOG_FILE = paths.LOGS_DIR / "ai_usage_log.jsonl"

# tier used when Gemini is unavailable and we must answer the user locally
_USER_FALLBACK_TIER = "medium"


class AISession:
    """Tracks per-turn state (notably the Gemini call budget)."""

    def __init__(self, center: "AICenter"):
        self.center = center
        self.gemini_calls = 0

    def run_task(self, task_type: str, messages: list[dict[str, str]],
                 complexity: str = "small", **opts) -> ProviderResult:
        return self.center._run(task_type, messages, complexity, self, **opts)


class AICenter:
    def __init__(self):
        host, auth = config.ollama_settings()
        self.ollama = OllamaProvider(host=host, auth_header=auth)
        self.gemini = GeminiProvider(api_key=config.gemini_api_key())
        self._ollama_models_cache: list[str] | None = None  # lazily fetched

    def _pick_ollama_model(self, requested: str) -> str:
        """
        Return a model that's actually pulled in Ollama. If the requested tier model
        isn't installed (common — e.g. only one model pulled), fall back to an
        installed one (preferring a same-family match) so tasks don't 404.
        """
        if self._ollama_models_cache is None:
            self._ollama_models_cache = self.ollama.available_models()
        installed = self._ollama_models_cache
        if not installed:          # couldn't list (offline) — try as-is
            return requested
        if requested in installed:
            return requested
        base = requested.split(":")[0]
        same_family = [m for m in installed if m.split(":")[0] == base]
        return (same_family or installed)[0]

    def session(self) -> AISession:
        return AISession(self)

    # convenience for one-off internal tasks (no shared budget)
    def run_task(self, task_type: str, messages: list[dict[str, str]],
                 complexity: str = "small", **opts) -> ProviderResult:
        return self._run(task_type, messages, complexity, self.session(), **opts)

    # ----- internal routing -------------------------------------------------
    def _run(self, task_type, messages, complexity, session, **opts) -> ProviderResult:
        if task_type == "user_answer":
            return self._user_answer(messages, session, **opts)
        return self._internal(task_type, messages, complexity, **opts)

    def _user_answer(self, messages, session, **opts) -> ProviderResult:
        provider_name, model, max_calls = models.user_answer_model()
        cfg = config.load_ai_config()

        # Try Gemini if it's the chosen provider, within budget, and configured.
        if provider_name == "gemini" and session.gemini_calls < max_calls and self.gemini.available():
            try:
                result = self._timed("user_answer", self.gemini, messages, model, **opts)
                session.gemini_calls += 1
                return result
            except ProviderError as e:
                self._log("user_answer", "gemini", model, ok=False, ms=0, error=str(e))
                if not cfg.get("fallback_to_ollama", True):
                    raise

        # Fallback (or non-Gemini config): answer locally with a capable Ollama model.
        local_model = self._pick_ollama_model(models.ollama_model_for(_USER_FALLBACK_TIER))
        return self._timed("user_answer", self.ollama, messages, local_model, **opts)

    def _internal(self, task_type, messages, complexity, **opts) -> ProviderResult:
        model = self._pick_ollama_model(models.ollama_model_for(complexity))
        return self._timed(task_type, self.ollama, messages, model, **opts)

    # ----- execution + logging ---------------------------------------------
    def _timed(self, task_type, provider, messages, model, **opts) -> ProviderResult:
        start = time.perf_counter()
        try:
            result = provider.generate(messages, model, **opts)
            ms = round((time.perf_counter() - start) * 1000)
            self._log(task_type, provider.name, model, ok=True, ms=ms, usage=result.usage)
            return result
        except ProviderError as e:
            ms = round((time.perf_counter() - start) * 1000)
            self._log(task_type, provider.name, model, ok=False, ms=ms, error=str(e))
            raise

    def _log(self, task_type, provider, model, ok, ms, usage=None, error=None):
        paths.LOGS_DIR.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "task_type": task_type,
            "provider": provider,
            "model": model,
            "ok": ok,
            "ms": ms,
            "usage": usage or {},
        }
        if error:
            entry["error"] = error
        with open(USAGE_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
