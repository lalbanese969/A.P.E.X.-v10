"""
A.P.E.X. AI subsystem (the "brain" + AI Center).

  providers/  - thin wrappers over each model backend (Ollama local/cloud, Gemini cloud)
  center.py   - the AI Center: routes each task to the right provider/model and logs usage
  models.py   - maps complexity tiers -> concrete model names (from config/ai_center.json)
  config.py   - loads config/ai_center.json and secrets (Gemini key, Ollama host/auth)

Design rules:
  - Gemini is the PAID, user-facing brain: used sparingly (1, max 2 calls per UI turn).
  - Ollama is local/free and does all internal/backend work, routed by complexity tier.
  - No third-party dependencies — every provider talks plain HTTP via urllib.
"""

from . import config, models, center  # noqa: F401
