"""Test-only defaults for settings that Settings() requires but these
tests never actually use (no live DB/LLM call happens in this suite —
see test_sql_engine.py, test_compensation_rules.py, test_pricing.py,
all pure-function tests). Must run before anything imports app.config,
which is why this is set at conftest module load time rather than
inside a fixture.
"""

import os

os.environ.setdefault("SUPABASE_DB_URL", "postgresql://user:pass@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")
os.environ.setdefault("GROQ_API_KEY", "gsk-test-key-not-used")
