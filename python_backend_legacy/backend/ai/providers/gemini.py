"""
gemini.py — the PAID, user-facing brain via Google's Gemini REST API.

Uses the Generative Language REST endpoint over stdlib urllib (no dependency).
The API key comes from secrets/secrets.json (ai_providers.gemini_api_key).

The AI Center is responsible for using this sparingly (1, max 2 calls per UI turn);
this class just performs a single call.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from .base import Provider, ProviderError, ProviderResult

_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(Provider):
    name = "gemini"

    def __init__(self, api_key: str, timeout: float = 60.0):
        self.api_key = api_key or ""
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.api_key)

    @staticmethod
    def _to_gemini(messages: list[dict[str, str]]) -> tuple[list[dict], dict | None]:
        """Convert role-based messages -> Gemini contents + optional systemInstruction."""
        contents: list[dict] = []
        system_text: list[str] = []
        for m in messages:
            role = m.get("role")
            text = m.get("content", "")
            if role == "system":
                system_text.append(text)
            else:
                contents.append({
                    "role": "model" if role == "assistant" else "user",
                    "parts": [{"text": text}],
                })
        system_instruction = {"parts": [{"text": "\n\n".join(system_text)}]} if system_text else None
        return contents, system_instruction

    def generate(self, messages: list[dict[str, str]], model: str, **opts) -> ProviderResult:
        if not self.api_key:
            raise ProviderError("No Gemini API key configured (secrets/secrets.json -> ai_providers.gemini_api_key).")

        contents, system_instruction = self._to_gemini(messages)
        payload: dict = {"contents": contents}
        if system_instruction:
            payload["systemInstruction"] = system_instruction
        if opts.get("generation_config"):
            payload["generationConfig"] = opts["generation_config"]

        url = f"{_API_BASE}/{model}:generateContent?key={self.api_key}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data,
                                     headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")
            except Exception:
                pass
            raise ProviderError(f"Gemini HTTP {e.code}: {detail[:300]}") from e
        except urllib.error.URLError as e:
            raise ProviderError(f"Gemini unreachable: {e}") from e
        except Exception as e:
            raise ProviderError(f"Gemini error: {e}") from e

        text = _extract_text(body)
        if not text:
            raise ProviderError(f"Gemini returned no text: {json.dumps(body)[:300]}")

        usage = body.get("usageMetadata", {}) or {}
        return ProviderResult(text=text.strip(), provider=self.name, model=model, usage={
            "prompt_tokens": usage.get("promptTokenCount"),
            "completion_tokens": usage.get("candidatesTokenCount"),
        })


def _extract_text(body: dict) -> str:
    """Pull the text out of a Gemini generateContent response."""
    candidates = body.get("candidates") or []
    if not candidates:
        return ""
    parts = (candidates[0].get("content") or {}).get("parts") or []
    return "".join(p.get("text", "") for p in parts)
