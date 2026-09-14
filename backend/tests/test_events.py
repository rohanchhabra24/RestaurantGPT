"""is_known_event_type is the allowlist gate in front of every event write
— covered directly since record_event itself needs a live DB.
"""

from app.services.events import KNOWN_EVENT_TYPES, is_known_event_type


def test_known_event_types_are_accepted():
    for event_type in KNOWN_EVENT_TYPES:
        assert is_known_event_type(event_type) is True


def test_unknown_event_type_is_rejected():
    assert is_known_event_type("something_made_up") is False


def test_empty_string_is_rejected():
    assert is_known_event_type("") is False
