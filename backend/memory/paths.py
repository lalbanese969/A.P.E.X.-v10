"""
paths.py — single source of truth for where memory lives on disk.

Everything else imports these instead of hardcoding paths, so moving the repo
or the core_memory folder only requires editing this one file.
"""

from pathlib import Path

# This file is at: <repo>/backend/memory/paths.py
# parents[0]=memory, parents[1]=backend, parents[2]=<repo root>
REPO_ROOT = Path(__file__).resolve().parents[2]

CORE_MEMORY = REPO_ROOT / "core_memory"

CATALOG_FILE   = CORE_MEMORY / "memory_catalog.json"
PEOPLE_DIR     = CORE_MEMORY / "people"
PROJECTS_DIR   = CORE_MEMORY / "projects"
APEX_SELF_DIR  = CORE_MEMORY / "apex_self"
PROFILE_FILE   = APEX_SELF_DIR / "apex_profile.json"
WRITING_STYLE_FILE = APEX_SELF_DIR / "writing_style.json"
LOGS_DIR            = CORE_MEMORY / "logs"
WRITE_LOG_FILE      = LOGS_DIR / "memory_write_log.jsonl"
RESOLUTION_LOG_FILE = LOGS_DIR / "memory_resolution_log.jsonl"


def resolve(rel_or_abs: str) -> Path:
    """
    Resolve a path that may be stored relative to the repo root
    (e.g. catalog cards store 'core_memory/people/example_person_taylor.json').
    """
    p = Path(rel_or_abs)
    return p if p.is_absolute() else (REPO_ROOT / p)
