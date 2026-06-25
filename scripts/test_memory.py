"""
test_memory.py — verify Memory V1 and exercise the chat pipeline.

Run from the repo root:

    python scripts/test_memory.py

It does three things:
  1. STRUCTURE  — checks the core_memory folders/files exist.
  2. VALIDITY   — parses every JSON file and confirms each catalog card points to
                  a real memory file.
  3. PIPELINE   — runs the four test prompts through backend.pipeline.handle_prompt
                  and prints the Memory Packet + mock A.P.E.X. response.

Exits non-zero if any structure/validity check fails (handy for CI later).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# make the repo root importable so `import backend...` works from scripts/
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.memory import paths, catalog  # noqa: E402
from backend import pipeline               # noqa: E402


TEST_PROMPTS = [
    "What should I get Taylor for her birthday?",
    "How old is my girlfriend?",
    "Remember that Taylor likes sushi.",
    "What do you know about A.P.E.X.?",
]


def _ok(msg):   print(f"  [OK]   {msg}")
def _fail(msg): print(f"  [FAIL] {msg}")


def check_structure() -> list[str]:
    print("\n[1] STRUCTURE")
    problems = []
    required = [
        paths.CORE_MEMORY, paths.CATALOG_FILE,
        paths.PEOPLE_DIR, paths.PROJECTS_DIR, paths.APEX_SELF_DIR, paths.LOGS_DIR,
        paths.PROFILE_FILE,
        paths.PEOPLE_DIR / "person_schema.json",
        paths.PEOPLE_DIR / "example_person_taylor.json",
        paths.PROJECTS_DIR / "project_schema.json",
        paths.PROJECTS_DIR / "example_project_apex.json",
    ]
    for p in required:
        if p.exists():
            _ok(p.relative_to(REPO_ROOT))
        else:
            _fail(f"missing: {p.relative_to(REPO_ROOT)}")
            problems.append(str(p))
    return problems


def check_validity() -> list[str]:
    print("\n[2] VALIDITY (JSON + catalog pointers)")
    problems = []
    for jf in sorted(paths.CORE_MEMORY.rglob("*.json")):
        try:
            json.load(open(jf, encoding="utf-8"))
            _ok(f"valid JSON: {jf.relative_to(REPO_ROOT)}")
        except Exception as e:
            _fail(f"bad JSON: {jf.relative_to(REPO_ROOT)} ({e})")
            problems.append(str(jf))

    # every catalog card must point to a file that exists
    for card in catalog.iter_cards():
        target = paths.resolve(card.get("memory_file", ""))
        if target.exists():
            _ok(f"card {card.get('id')} -> {card.get('memory_file')}")
        else:
            _fail(f"card {card.get('id')} points to missing file: {card.get('memory_file')}")
            problems.append(card.get("id"))
    return problems


def run_pipeline() -> None:
    print("\n[3] PIPELINE (resolver -> packet -> mock response)")
    for prompt in TEST_PROMPTS:
        print("\n" + "-" * 70)
        print(f'PROMPT: "{prompt}"')
        result = pipeline.handle_prompt(prompt)
        print("\nMemory Packet:")
        print(json.dumps(result["memory_packet"], ensure_ascii=False, indent=2))
        print("\nMock A.P.E.X. response:")
        print("  " + result["apex_response"])


def main() -> int:
    print("=" * 70)
    print("A.P.E.X. Memory V1 — verification + pipeline test")
    print("=" * 70)

    problems = check_structure() + check_validity()
    run_pipeline()

    print("\n" + "=" * 70)
    if problems:
        print(f"RESULT: {len(problems)} problem(s) found. See [FAIL] lines above.")
        return 1
    print("RESULT: all structure + validity checks passed. Pipeline ran for all prompts.")
    print(f"Resolution log: {paths.RESOLUTION_LOG_FILE.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
