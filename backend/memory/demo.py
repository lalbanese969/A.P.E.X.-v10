"""
demo.py — command-line tester for Memory V1.

Run from the repo root:

    python -m backend.memory.demo "What should I get Taylor for her birthday?"

It prints:
    1. the resolver candidates (what matched and why),
    2. the assembled Memory Packet (what the main AI would receive),
    3. the writer's proposal (what it WOULD log — non-destructive).

With no argument it runs a small built-in suite of example prompts.
"""

from __future__ import annotations

import json
import sys

from . import resolver, packet_builder, writer, profile


EXAMPLE_PROMPTS = [
    "What should I get Taylor for her birthday?",
    "How old is my girlfriend?",
    "Remember that Taylor likes sushi.",
    "What do you know about A.P.E.X.?",
]


def _print_header(title: str) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


def _dump(label: str, obj) -> None:
    print(f"\n--- {label} ---")
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def run_one(prompt: str) -> None:
    _print_header(f'PROMPT: "{prompt}"')

    candidates = resolver.resolve(prompt)
    brief = [
        {"id": c["card"]["id"], "score": c["score"],
         "matched_on": c["matched_on"], "suggested_sections": c["suggested_sections"]}
        for c in candidates
    ]
    _dump("1) Resolver candidates", brief)

    packet = packet_builder.build_packet(prompt)
    _dump("2) Memory Packet (sent to main AI)", packet)

    proposal = writer.review_interaction(prompt, assistant_response="(demo: no AI response)")
    _dump("3) Writer proposal (logged, non-destructive)", proposal)


def main() -> None:
    args = sys.argv[1:]
    if args:
        run_one(" ".join(args))
    else:
        _print_header("A.P.E.X. Memory V1 — running example suite")
        _dump("A.P.E.X. profile summary", profile.profile_summary())
        for p in EXAMPLE_PROMPTS:
            run_one(p)


if __name__ == "__main__":
    main()
