"""
ollama.py — local/free brain via the Ollama HTTP API.

Talks to Ollama's /api/chat over plain HTTP (stdlib urllib — no dependency).

CLOUD-READY: the host and an optional Authorization header come from config, so
pointing A.P.E.X. at a remote/cloud Ollama is a config change (config/ai_center.json:
"ollama_host" + "ollama_auth_header"), not a code change.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from .base import Provider, ProviderError, ProviderResult


class OllamaProvider(Provider):
    name = "ollama"

    def __init__(self, host: str = "http://localhost:11434", auth_header: str | None = None,
                 timeout: float = 120.0):
        self.host = host.rstrip("/")
        self.auth_header = auth_header
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.auth_header:
            headers["Authorization"] = self.auth_header
        return headers

    def available(self) -> bool:
        """Best-effort: ping the Ollama tags endpoint."""
        try:
            req = urllib.request.Request(f"{self.host}/api/tags", headers=self._headers())
            with urllib.request.urlopen(req, timeout=3):
                return True
        except Exception:
            return False

    def available_models(self) -> list[str]:
        """Return the model names currently pulled in Ollama (empty list if unreachable)."""
        try:
            req = urllib.request.Request(f"{self.host}/api/tags", headers=self._headers())
            with urllib.request.urlopen(req, timeout=3) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return [m.get("name", "") for m in body.get("models", []) if m.get("name")]
        except Exception:
            return []

    def generate(self, messages: list[dict[str, str]], model: str, **opts) -> ProviderResult:
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        # pass through optional generation options (temperature, etc.)
        if opts.get("options"):
            payload["options"] = opts["options"]

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(f"{self.host}/api/chat", data=data,
                                     headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            raise ProviderError(f"Ollama unreachable at {self.host}: {e}") from e
        except Exception as e:
            raise ProviderError(f"Ollama error: {e}") from e

        text = (body.get("message") or {}).get("content", "").strip()
        if not text:
            raise ProviderError("Ollama returned an empty response.")

        usage = {
            "prompt_tokens": body.get("prompt_eval_count"),
            "completion_tokens": body.get("eval_count"),
        }
        return ProviderResult(text=text, provider=self.name, model=model, usage=usage)
