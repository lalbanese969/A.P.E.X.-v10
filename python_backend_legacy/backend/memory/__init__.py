"""
A.P.E.X. Memory engine (V1)
===========================

The READ path (efficient — never dumps all memory into the prompt):

    memory_catalog.json   ->   resolver.resolve()   ->   packet_builder.build_packet()
    (table of contents)        (find relevant cards)     (load only needed sections -> small packet)

The WRITE path (V1 is non-destructive):

    writer.review_interaction()  ->  appends PROPOSED writes to core_memory/logs/memory_write_log.jsonl
                                     (it never edits memory records automatically)

Other modules:
    catalog.py  - load/scan the catalog
    profile.py  - safe, append-only updates to the A.P.E.X. self-profile
    schemas.py  - schema templates + helpers (new_person, compute_age, validation)
    paths.py    - one place that knows where core_memory/ lives

Run the CLI tester from the repo root:
    python -m backend.memory.demo "What should I get Taylor for her birthday?"
"""

from . import paths, schemas, catalog, resolver, packet_builder, writer, profile  # noqa: F401
