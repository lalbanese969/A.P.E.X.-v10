"""
center.py — the AI Center: route each task to a provider and log usage.

Provider-based routing (configured in config/ai_center.json):
  - task "user_answer"  -> user_answer.provider/model        (default: Groq)
  - any other task      -> internal.provider + tier model    (default: Groq small)
  - if the chosen provider is unavailable or errors          -> fallback_provider (default: Ollama)
  - if nothing is reachable                                  -> ProviderError (pipeline shows a memory-only message)

Providers: groq (fast/free cloud), gemini (cloud), ollama (local). All speak HTTP via stdlib.

Usage:
    center = AICenter()
    sess = center.session()
    ans  = sess.run_task("user_answer", messages)
    tag  = sess.run_task("classify", messages, "small")

Every call is logged to core_memory/logs/ai_usage_log.jsonl.
"""

from __future__ import annotations

import json
import time
from datetime import datetime

from . import config, models
from .providers.base import ProviderError, ProviderResult
from .providers.gemini import GeminiProvider
from .providers.groq import GroqProvider
from .providers.ollama import OllamaProvider

from ..memory import paths

USAGE_LOG_FILE = paths.LOGS_DIR / "ai_usage_log.jsonl"


class AISession:
    """Per-turn handle (kept for API symmetry; routing state lives on the center)."""

    def __init__(self, center: "AICenter"):
        self.center = center

    def run_task(self, task_type: str, messages: list[dict[str, str]],
                 complexity: str = "small", **opts) -> ProviderResult:
        return self.center._run(task_type, messages, complexity, **opts)


class AICenter:
    def __init__(self):
        host, auth = config.ollama_settings()
        self.ollama = OllamaProvider(host=host, auth_header=auth)
        self.gemini = GeminiProvider(api_key=config.gemini_api_key())
        self.groq = GroqProvider(api_key=config.groq_api_key())
        self.providers = {"ollama": self.ollama, "gemini": self.gemini, "groq": self.groq}
        self._ollama_models_cache: list[str] | None = None

    def session(self) -> AISession:
        return AISession(self)

    def run_task(self, task_type: str, messages, complexity: str = "small", **opts) -> ProviderResult:
        return self._run(task_type, messages, complexity, **opts)

    # ----- routing ----------------------------------------------------------
    def _run(self, task_type, messages, complexity, **opts) -> ProviderResult:
        if task_type == "user_answer":
            prov_name, model = models.user_answer_cfg()
        else:
            prov_name, tiers = models.internal_cfg()
            model = tiers.get(complexity) or tiers.get("small") or next(iter(tiers.values()), None)
        return self._call_with_fallback(task_type, prov_name, model, complexity, messages, **opts)

    def _call_with_fallback(self, task_type, prov_name, model, complexity, messages, **opts):
        # 1) primary provider
        prov = self.providers.get(prov_name)
        resolved = self._resolve_model(prov_name, model, complexity)
        if prov is not None and prov.available() and resolved:
            try:
                return self._timed(task_type, prov, messages, resolved, **opts)
            except ProviderError as e:
                self._log(task_type, prov_name, resolved, ok=False, ms=0, error=str(e))

        # 2) fallback provider (e.g., local Ollama)
        fb_name = models.fallback_provider()
        if fb_name and fb_name != prov_name:
            fb = self.providers.get(fb_name)
            fb_model = self._resolve_model(fb_name, None, complexity)
            if fb is not None and fb.available() and fb_model:
                return self._timed(task_type, fb, messages, fb_model, **opts)

        raise ProviderError(f"No AI provider available for '{task_type}' "
                            f"(tried '{prov_name}', fallback '{fb_name}').")

    def _resolve_model(self, prov_name, model, complexity):
        """Pick a concrete model name for a provider (handles Ollama install fallback)."""
        if prov_name == "ollama":
            m = model or models.ollama_model_for(complexity or "medium")
            return self._pick_ollama_model(m)
        if prov_name == "gemini":
            return model or models.gemini_model()
        if prov_name == "groq":
            if model:
                return model
            _, tiers = models.internal_cfg()
            return tiers.get(complexity or "small") or "llama-3.1-8b-instant"
        return model

    def _pick_ollama_model(self, requested: str) -> str:
        """Fall back to an installed Ollama model if the requested one isn't pulled."""
        if self._ollama_models_cache is None:
            self._ollama_models_cache = self.ollama.available_models()
        installed = self._ollama_models_cache
        if not installed or requested in installed:
            return requested
        base = requested.split(":")[0]
        same_family = [m for m in installed if m.split(":")[0] == base]
        return (same_family or installed)[0]

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
            "task_type": task_type, "provider": provider, "model": model,
            "ok": ok, "ms": ms, "usage": usage or {},
        }
        if error:
            entry["error"] = error
        with open(USAGE_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
