"""Historical weather lookup for the DIAGNOSTIC investigation path (see
multi_agent_investigator.py's correlation step) — Open-Meteo's free
geocoding + historical archive APIs, no key required. Deliberately NOT
called from every question: only the multi-hop "why did X happen"
investigation path touches this module, per product's cost/latency
constraint on external calls.

Two rules keep this from becoming a new hallucination surface, matching
the same discipline grounding.py already applies to ORDER/POLICY
citations:

1. Every weather fact the model can cite is parsed deterministically by
   this module (WMO weather code -> a fixed label, precipitation_sum ->
   a float) — the LLM never invents a condition or a rain amount, it can
   only restate what's returned here, and grounding.py verifies a
   [WEATHER:<date>] marker against this exact data the same mechanical
   way it verifies [ORDER:...]/[POLICY:...].
2. Any failure — no location configured, geocoding failed, the archive
   API errored or timed out, or returned no data for that date — returns
   None. Never a default, never "assume no rain", never a stale/wrong
   guess. Callers must treat None as "we don't know" and say so; see
   multi_agent_investigator.py's weather_agent step.
"""

import logging
import uuid
from datetime import date

import httpx

from app.db import get_pool

logger = logging.getLogger("weather_service")

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
REQUEST_TIMEOUT_S = 5.0

# WMO weather interpretation codes (https://open-meteo.com/en/docs) that
# mean measurable rain, drizzle, or a thunderstorm. Anything else (clear,
# cloudy, fog, snow) is not-rainy for this app's purposes — restaurant
# delivery delays in India correlate with rain, not snow.
_RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}

_CODE_LABELS = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "depositing rime fog",
    51: "light drizzle", 53: "moderate drizzle", 55: "dense drizzle",
    56: "light freezing drizzle", 57: "dense freezing drizzle",
    61: "slight rain", 63: "moderate rain", 65: "heavy rain",
    66: "light freezing rain", 67: "heavy freezing rain",
    71: "slight snow", 73: "moderate snow", 75: "heavy snow", 77: "snow grains",
    80: "slight rain showers", 81: "moderate rain showers", 82: "violent rain showers",
    85: "slight snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with slight hail", 99: "thunderstorm with heavy hail",
}


def describe_code(code: int) -> str:
    return _CODE_LABELS.get(code, f"weather code {code}")


def is_rain_code(code: int) -> bool:
    return code in _RAIN_CODES


async def get_coordinates(restaurant_id: str) -> tuple[float, float] | None:
    """(lat, lon) for a restaurant, geocoding once from its configured
    city and persisting the result — never re-geocodes the same
    restaurant twice. Returns None (never a guessed location) if no city
    is set or geocoding fails/finds nothing."""
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select city, latitude, longitude from restaurants where id = $1", rid
        )
        if row is None:
            return None
        if row["latitude"] is not None and row["longitude"] is not None:
            return float(row["latitude"]), float(row["longitude"])
        if not row["city"]:
            return None
        city = row["city"]

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            resp = await client.get(GEOCODE_URL, params={"name": city, "count": 1})
            resp.raise_for_status()
            results = resp.json().get("results")
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("Geocoding failed for restaurant %s city=%r: %s", restaurant_id, city, e)
        return None

    if not results:
        return None
    lat, lon = float(results[0]["latitude"]), float(results[0]["longitude"])

    async with pool.acquire() as conn:
        await conn.execute(
            "update restaurants set latitude = $1, longitude = $2 where id = $3", lat, lon, rid
        )
    return lat, lon


async def get_historical_weather(restaurant_id: str, observed_date: date) -> dict | None:
    """{"date": iso-str, "condition": str, "is_rainy": bool,
    "precipitation_mm": float | None} for the given date at the
    restaurant's location — or None if genuinely unavailable. Cache-first:
    a date already looked up for this restaurant never re-hits the API."""
    pool = await get_pool()
    rid = uuid.UUID(restaurant_id)

    async with pool.acquire() as conn:
        cached = await conn.fetchrow(
            """select precipitation_mm, condition, is_rainy
               from weather_cache where restaurant_id = $1 and observed_date = $2""",
            rid, observed_date,
        )
    if cached:
        return {
            "date": observed_date.isoformat(),
            "condition": cached["condition"],
            "is_rainy": cached["is_rainy"],
            "precipitation_mm": float(cached["precipitation_mm"]) if cached["precipitation_mm"] is not None else None,
        }

    coords = await get_coordinates(restaurant_id)
    if coords is None:
        return None
    lat, lon = coords

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            resp = await client.get(ARCHIVE_URL, params={
                "latitude": lat, "longitude": lon,
                "start_date": observed_date.isoformat(), "end_date": observed_date.isoformat(),
                "daily": "weathercode,precipitation_sum",
                "timezone": "auto",
            })
            resp.raise_for_status()
            daily = resp.json().get("daily") or {}
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("Weather archive lookup failed for restaurant %s date=%s: %s", restaurant_id, observed_date, e)
        return None

    codes = daily.get("weathercode") or []
    precip = daily.get("precipitation_sum") or []
    if not codes or codes[0] is None:
        return None

    code = int(codes[0])
    precipitation_mm = float(precip[0]) if precip and precip[0] is not None else None
    condition = describe_code(code)
    is_rainy = is_rain_code(code) or (precipitation_mm or 0) > 0.5

    async with pool.acquire() as conn:
        await conn.execute(
            """insert into weather_cache
               (restaurant_id, observed_date, latitude, longitude, precipitation_mm, weather_code, condition, is_rainy)
               values ($1,$2,$3,$4,$5,$6,$7,$8)
               on conflict (restaurant_id, observed_date) do nothing""",
            rid, observed_date, lat, lon, precipitation_mm, code, condition, is_rainy,
        )

    return {
        "date": observed_date.isoformat(),
        "condition": condition,
        "is_rainy": is_rainy,
        "precipitation_mm": precipitation_mm,
    }
