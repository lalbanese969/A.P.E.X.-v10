"""
groq.py — fast, free-tier cloud brain via Groq's OpenAI-compatible API.

Groq hosts open models (Llama, etc.) and is very fast. Because it's cloud + over HTTP,
it works from a hosted server / iPad (unlike local Ollama). Uses stdlib urllib only.

API key from secrets/secrets.json (ai_providers.groq_api_key) or the GROQ_API_KEY env var.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from .base import Provider, ProviderError, ProviderResult

_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqProvider(Provider):
    name = "groq"

    def __init__(self, api_key: str, timeout: float = 60.0):
        self.api_key = api_key or ""
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.api_key)

    def generate(self, messages: list[dict[str, str]], model: str, **opts) -> ProviderResult:
        if not self.api_key:
            raise ProviderError("No Groq API key (secrets/secrets.json -> ai_providers.groq_api_key).")

        payload: dict = {"model": model, "messages": messages}
        if opts.get("temperature") is not None:
            payload["temperature"] = opts["temperature"]

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            _API_URL, data=data, method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                # Cloudflare (fronting api.groq.com) blocks the default urllib User-Agent
                # as bot traffic (HTTP 403 / Cloudflare error 1010) — a normal-looking UA fixes it.
                "User-Agent": "Mozilla/5.0 (compatible; APEX-AI-Center/1.0)",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")
            except Exception:
                pass
            raise ProviderError(f"Groq HTTP {e.code}: {detail[:300]}") from e
        except urllib.error.URLError as e:
            raise ProviderError(f"Groq unreachable: {e}") from e
        except Exception as e:
            raise ProviderError(f"Groq error: {e}") from e

        try:
            text = body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            raise ProviderError(f"Groq returned no text: {json.dumps(body)[:300]}")
        if not text:
            raise ProviderError("Groq returned an empty response.")

        usage = body.get("usage", {}) or {}
        return ProviderResult(text=text, provider=self.name, model=model, usage={
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
        })
