"""Structured extraction — pulls the numeric compensation-rule parameters
out of an arbitrary policy document's text via a schema-constrained LLM
call, rather than assuming every uploaded policy is written in exactly the
same words as the seed document. This is what lets the Policy Change
Impact Simulator compare two *different* policy documents' actual numbers
instead of only ever replaying the one hardcoded rule set.

This is a distinct technique from the router/synthesis JSON calls
elsewhere: an information-extraction pass whose output is a rule object
consumed by deterministic code (compensation_rules.py), not free text
shown to anyone.
"""

from app.config import settings
from app.services.claude_client import complete_json
from app.services.compensation_rules import DEFAULT_PARAMS, PolicyParams

SYSTEM = """Extract compensation-eligibility rule parameters from this SLA/
compensation policy document. Look for clauses about weather/force majeure
delays, courier no-shows, and restaurant-caused delays.

Respond with ONLY a JSON object with these exact keys (use the policy's
stated values; if a parameter genuinely isn't mentioned, use the default
given in parentheses):
{
  "weather_min_delay_minutes": number (default 15),
  "weather_pct_of_value": number as a fraction e.g. 0.5 for 50% (default 0.5),
  "courier_no_show_pct_of_value": number as a fraction (default 1.0),
  "restaurant_min_delay_minutes": number (default 10),
  "restaurant_pct_of_value": number as a fraction e.g. 0.25 for 25% (default 0.25)
}"""


async def extract_policy_params(document_text: str) -> PolicyParams:
    try:
        result = await complete_json(settings.sql_model, SYSTEM, document_text[:8000], max_tokens=300)
        return PolicyParams(
            weather_min_delay_seconds=int(result.get("weather_min_delay_minutes", 15) * 60),
            weather_pct_of_value=float(result.get("weather_pct_of_value", 0.5)),
            courier_no_show_pct_of_value=float(result.get("courier_no_show_pct_of_value", 1.0)),
            restaurant_min_delay_seconds=int(result.get("restaurant_min_delay_minutes", 10) * 60),
            restaurant_pct_of_value=float(result.get("restaurant_pct_of_value", 0.25)),
        )
    except Exception:
        # Extraction failing shouldn't block ingestion — fall back to the
        # known-good defaults rather than a half-parsed rule set.
        return DEFAULT_PARAMS
