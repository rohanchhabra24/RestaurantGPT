"""CreateRestaurantIn.timezone validation — added during the production-
readiness audit. Before this, an invalid IANA timezone string written at
onboarding sat unnoticed until synthesis.generate_greeting's
ZoneInfo(timezone) call 500'd on it, on some unrelated later request.
Pure model-validation tests — no DB/network needed, since Pydantic raises
before any of that is ever touched.
"""

import pytest
from pydantic import ValidationError

from app.routers.onboarding import CreateRestaurantIn


def test_default_timezone_is_valid():
    body = CreateRestaurantIn(name="Test Restaurant")
    assert body.timezone == "Asia/Kolkata"


def test_valid_iana_timezone_accepted():
    body = CreateRestaurantIn(name="Test Restaurant", timezone="America/New_York")
    assert body.timezone == "America/New_York"


def test_invalid_timezone_rejected():
    with pytest.raises(ValidationError):
        CreateRestaurantIn(name="Test Restaurant", timezone="Not/A_Real_Zone")


def test_empty_timezone_rejected():
    with pytest.raises(ValidationError):
        CreateRestaurantIn(name="Test Restaurant", timezone="")
