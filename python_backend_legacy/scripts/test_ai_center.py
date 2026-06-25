"""
test_ai_center.py — verify AI Center provider routing + fallback.

Run from the repo root:

    python scripts/test_ai_center.py

Providers are stubbed so routing is deterministic and needs no real keys/Ollama.
At the end it reports real reachability (Groq key / Ollama / Gemini key) as info.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.ai import center as center_mod, config            # noqa: E402
from backend.ai.providers.base import ProviderError, ProviderResult  # noqa: E402


class FakeProvider:
    def __init__(self, name, ok=True):
        self.name = name
        self.ok = ok
        self.calls = []

    def available(self):
        return self.ok

    def available_models(self):
        return []

    def generate(self, messages, model, **opts):
        self.calls.append(model)
        if not self.ok:
            raise ProviderError(f"{self.name} unavailable (stub)")
        return ProviderResult(text=f"[{self.name}:{model}] ok", provider=self.name, model=model)


def make_center(groq_ok=True, gemini_ok=True, ollama_ok=True):
    c = center_mod.AICenter()
    c.groq = FakeProvider("groq", groq_ok)
    c.gemini = FakeProvider("gemini", gemini_ok)
    c.ollama = FakeProvider("ollama", ollama_ok)
    c.providers = {"groq": c.groq, "gemini": c.gemini, "ollama": c.ollama}
    return c


def check(label, cond):
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    return cond


def main() -> int:
    print("=" * 64)
    print("AI Center — provider routing + fallback (stubbed)")
    print("=" * 64)
    ok = True

    # 1) user_answer -> primary provider (groq by default config)
    r = make_center().session().run_task("user_answer", [{"role": "user", "content": "hi"}])
    ok &= check("user_answer routes to primary provider (groq)", r.provider == "groq")

    # 2) internal task -> primary provider (groq)
    r = make_center().session().run_task("classify", [{"role": "user", "content": "hi"}], "small")
    ok &= check("internal 'classify' routes to primary provider (groq)", r.provider == "groq")

    # 3) primary down -> fallback provider (ollama)
    r = make_center(groq_ok=False).session().run_task("user_answer", [{"role": "user", "content": "hi"}])
    ok &= check("primary down -> falls back to ollama", r.provider == "ollama")

    # 4) primary + fallback down -> ProviderError
    raised = False
    try:
        make_center(groq_ok=False, ollama_ok=False).session().run_task(
            "user_answer", [{"role": "user", "content": "hi"}])
    except ProviderError:
        raised = True
    ok &= check("primary + fallback down -> raises ProviderError", raised)

    print("\nLive reachability (informational):")
    real = center_mod.AICenter()
    print(f"  Groq key configured:  {'yes' if real.groq.available() else 'no'}")
    print(f"  Ollama at {config.ollama_settings()[0]}: {'reachable' if real.ollama.available() else 'NOT reachable'}")
    print(f"  Gemini key configured: {'yes' if real.gemini.available() else 'no'}")

    print("\n" + ("RESULT: all routing checks passed." if ok else "RESULT: some checks FAILED."))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
