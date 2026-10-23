from app.services.multi_agent_investigator import _clean_zone, InvestigationStep, InvestigationResult

def test_clean_zone():
    assert _clean_zone("Zone 3") == "Zone 3"
    assert _clean_zone("zone 3") == "zone 3"
    assert _clean_zone("3") == "Zone 3"
    assert _clean_zone("Downtown") == "Zone Downtown"
    assert _clean_zone(None) == "All Zones"
    assert _clean_zone("") == "All Zones"

def test_step_formatting_no_none_leak():
    step = InvestigationStep(
        agent="Delivery Trend Analysis",
        description="Zone 3 delivery times averaged 34.4 mins across 12 recent orders — 5.2% slower than baseline."
    )
    assert "Nonemin" not in step.description
    assert "None%" not in step.description
    assert "Zone Zone" not in step.description
