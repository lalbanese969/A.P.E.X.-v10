"""
A.P.E.X. connections subsystem — external "hands" (email, calendar).

  accounts.py        - labeled account/calendar registry (config/accounts.json)
  email/             - email connector interface + mock implementation
  calendar/          - calendar connector interface + mock implementation
  registry.py        - hands back the right connector for an account/calendar

Mock-first: every connector returns sample data now, so the UI + pipeline work with
ZERO dependencies. Real OAuth implementations (Gmail/Outlook/Google Calendar) are a
later, gated step and will slot in behind these same interfaces.
"""

from . import accounts, registry  # noqa: F401
