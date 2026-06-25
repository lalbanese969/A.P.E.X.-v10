"""
test_ai_center.py — verify AI Center routing + Gemini budget guard.

Run from the repo root:

    python scripts/test_ai_center.py

This does NOT require Ollama or a Gemini key to pass the routing checks — it stubs the
providers so it can verify the decisions (which brain, budget cap, fallback) deterministically.
At the end it ALSO reports whether your real Ollama / Gemini are reachable, as info.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.ai import center as center_mod, config            # noqa: E402
from backend.ai.providers.base import ProviderResult, ProviderError  # noqa: E402


class FakeProvider:
    """Records calls and returns canned text, so routing is testable offline."""
    def __init__(self, name, ok=True):
        self.name = name
        self.ok = ok
        self.calls = []

    def available(self):
        return self.ok

    def available_models(self):
        return []  # empty -> AI Center uses the requested model as-is (fine for routing tests)

    def generate(self, messages, model, **opts):
        self.calls.append(model)
        if not self.ok:
            raise ProviderError(f"{self.name} unavailable (stub)")
        return ProviderResult(text=f"[{self.name}:{model}] ok", provider=self.name, model=model)


def make_center(gemini_ok=True, ollama_ok=True):
    c = center_mod.AICenter()
    c.gemini = FakeProvider("gemini", ok=gemini_ok)
    c.ollama = FakeProvider("ollama", ok=ollama_ok)
    return c


def check(label, cond):
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")
    return cond


def main() -> int:
    print("=" * 64)
    print("AI Center — routing + budget tests (providers stubbed)")
    print("=" * 64)
    ok = True

    # 1) internal task -> Ollama
    c = make_center()
    sess = c.session()
    r = sess.run_task("classify", [{"role": "user", "content": "hi"}], "small")
    ok &= check("internal 'classify' routes to Ollama", r.provider == "ollama")

    # 2) user_answer -> Gemini (when available + in budget)
    c = make_center()
    sess = c.session()
    r = sess.run_task("user_answer", [{"role": "user", "content": "hi"}])
    ok &= check("'user_answer' routes to Gemini", r.provider == "gemini")

    # 3) Gemini per-turn budget guard (default 1) -> 2nd call falls back to Ollama
    _, _, max_calls = __import__("backend.ai.models", fromlist=["user_answer_model"]).user_answer_model()
    c = make_center()
    sess = c.session()
    sess.run_task("user_answer", [{"role": "user", "content": "1"}])
    r2 = sess.run_task("user_answer", [{"role": "user", "content": "2"}])
    expect_fallback = (max_calls <= 1)
    ok &= check(f"2nd user_answer falls back to Ollama (budget={max_calls})",
                (r2.provider == "ollama") == expect_fallback)

    # 4) Gemini down -> fallback to Ollama
    c = make_center(gemini_ok=False)
    sess = c.session()
    r = sess.run_task("user_answer", [{"role": "user", "content": "hi"}])
    ok &= check("Gemini unavailable -> Ollama fallback", r.provider == "ollama")

    # info: real reachability
    print("\nLive reachability (informational):")
    real = center_mod.AICenter()
    print(f"  Ollama at {config.ollama_settings()[0]}: {'reachable' if real.ollama.available() else 'NOT reachable'}")
    print(f"  Gemini key configured: {'yes' if real.gemini.available() else 'no'}")

    print("\n" + ("RESULT: all routing checks passed." if ok else "RESULT: some checks FAILED."))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
