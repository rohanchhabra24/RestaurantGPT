from app.services.weather_service import describe_code, is_rain_code


def test_describe_code_known_codes():
    assert describe_code(0) == "clear sky"
    assert describe_code(61) == "slight rain"
    assert describe_code(95) == "thunderstorm"


def test_describe_code_unknown_code_falls_back_honestly():
    # An unrecognized WMO code should say so plainly, not silently
    # misreport it as clear/rainy/anything else.
    assert describe_code(12345) == "weather code 12345"


def test_is_rain_code_covers_rain_drizzle_and_thunderstorms():
    for code in (51, 61, 63, 65, 80, 81, 82, 95, 96, 99):
        assert is_rain_code(code) is True


def test_is_rain_code_excludes_clear_cloudy_fog_and_snow():
    for code in (0, 1, 2, 3, 45, 48, 71, 73, 75, 85, 86):
        assert is_rain_code(code) is False
