from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_db_url: str
    # Required (not just for the admin client) — auth.py derives the JWKS
    # verification endpoint from this: {supabase_url}/auth/v1/.well-known/jwks.json
    supabase_url: str
    supabase_service_key: str = ""

    groq_api_key: str
    router_model: str = "openai/gpt-oss-20b"
    sql_model: str = "openai/gpt-oss-120b"
    synthesis_model: str = "openai/gpt-oss-120b"

    # Per-tenant rate limit (requests per rolling window). Postgres-backed,
    # applied once a request is authenticated *and* onboarded — this is the
    # AI-cost control.
    rate_limit_per_minute: int = 20
    rate_limit_per_day: int = 500

    # Per-IP rate limits (slowapi, in-memory). This is the blanket bot/
    # scraping defense: it applies before auth is even checked, so it also
    # covers the one gap the per-tenant limiter can't — an attacker who
    # signs up many accounts to get a fresh quota each time. Not shared
    # across processes; move to slowapi's Redis storage_uri before running
    # more than one backend worker.
    ip_rate_limit_default: str = "60/minute"
    ip_rate_limit_account_create: str = "5/hour"
    ip_rate_limit_ai: str = "15/minute"

    # Alert-only — see semantic_cache/usage_tracking. Never blocks a tenant.
    cost_alert_threshold_usd: float = 20.0

    # Alert-only — see insights.check_ungrounded_alert. min_samples guards
    # against a tiny window making the rate noisy (1 ungrounded out of 2
    # queries is 50% but tells you nothing).
    ungrounded_alert_threshold_pct: float = 20.0
    ungrounded_alert_window_hours: int = 24
    ungrounded_alert_min_samples: int = 5

    # Used only by seed.py, which still needs a fixed id to seed demo data
    # against before a real signup exists for it. No API route trusts this
    # anymore — restaurant_id always comes from the authenticated JWT.
    demo_restaurant_id: str = "00000000-0000-0000-0000-000000000001"

    # Comma-separated frontend origins allowed by CORS. Defaults to the Vite
    # dev server; set this to the real deployed frontend origin(s) in
    # production — never "*" once allow_credentials is True.
    cors_allowed_origins: str = "http://localhost:5173"

    # Live Feed integration (live_feed_sync.py) — this backend's own
    # publicly-reachable base URL, used as the default live_feed_url
    # (self: /api/demo-feed/orders) so the daily-sync mechanism works via
    # a real HTTP fetch without requiring a separately hosted feed first.
    # Set this to the actual deployed backend URL in production.
    public_api_base_url: str = "http://localhost:8000"

    # Shared secret for POST /api/ingest/live-feed/sync-all — the endpoint
    # a scheduled job (e.g. a GitHub Actions cron workflow) calls to sync
    # every restaurant's live feed once a day without needing a per-user
    # JWT. Empty (default) disables the endpoint entirely — an unset
    # secret must never mean "open", the same reasoning as every other
    # secret-gated route in this app.
    cron_sync_secret: str = ""

    # Only set true when this process itself terminates TLS or sits behind
    # a proxy that forwards the original request scheme faithfully. Most
    # platform deployments already redirect to HTTPS at the load-balancer
    # layer, where enabling this too would misfire on the internal
    # plain-HTTP hop. See app/main.py.
    force_https: bool = False

    # Anomaly-scan sensitivity (anomaly_scan.py) — how big a deviation
    # counts as worth a diagnosis card, and the minimum sample size before
    # trusting an average at all. Configurable so this can be tuned per
    # deployment without a code change/redeploy.
    anomaly_delta_threshold_pct: float = 15.0
    anomaly_min_sample_size: int = 3

    # Multi-agent investigator's trend windows (multi_agent_investigator.py,
    # also used by anomaly_scan.py) — how many recent days count as "now"
    # vs. how many preceding days count as the baseline to compare against.
    investigator_recent_window_days: int = 7
    investigator_baseline_window_days: int = 28

    class Config:
        env_file = ".env"


settings = Settings()
