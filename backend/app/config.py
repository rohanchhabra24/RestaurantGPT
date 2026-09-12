from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_db_url: str
    # Required (not just for the admin client) — auth.py derives the JWKS
    # verification endpoint from this: {supabase_url}/auth/v1/.well-known/jwks.json
    supabase_url: str
    supabase_service_key: str = ""

    anthropic_api_key: str
    router_model: str = "claude-haiku-4-5"
    sql_model: str = "claude-sonnet-5"
    synthesis_model: str = "claude-sonnet-5"

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

    # Used only by seed.py, which still needs a fixed id to seed demo data
    # against before a real signup exists for it. No API route trusts this
    # anymore — restaurant_id always comes from the authenticated JWT.
    demo_restaurant_id: str = "00000000-0000-0000-0000-000000000001"

    # Comma-separated frontend origins allowed by CORS. Defaults to the Vite
    # dev server; set this to the real deployed frontend origin(s) in
    # production — never "*" once allow_credentials is True.
    cors_allowed_origins: str = "http://localhost:5173"

    # Only set true when this process itself terminates TLS or sits behind
    # a proxy that forwards the original request scheme faithfully. Most
    # platform deployments already redirect to HTTPS at the load-balancer
    # layer, where enabling this too would misfire on the internal
    # plain-HTTP hop. See app/main.py.
    force_https: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
