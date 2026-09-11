from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_db_url: str
    supabase_url: str = ""
    supabase_service_key: str = ""
    # Settings -> API -> JWT Settings in the Supabase dashboard (the legacy
    # shared HS256 secret). If a project has migrated to asymmetric signing
    # keys, auth.py's verification needs to switch to JWKS instead.
    supabase_jwt_secret: str = ""

    anthropic_api_key: str
    router_model: str = "claude-haiku-4-5"
    sql_model: str = "claude-sonnet-5"
    synthesis_model: str = "claude-sonnet-5"

    # Per-tenant rate limit (requests per rolling window).
    rate_limit_per_minute: int = 20
    rate_limit_per_day: int = 500

    # Alert-only — see semantic_cache/usage_tracking. Never blocks a tenant.
    cost_alert_threshold_usd: float = 20.0

    # Used only by seed.py, which still needs a fixed id to seed demo data
    # against before a real signup exists for it. No API route trusts this
    # anymore — restaurant_id always comes from the authenticated JWT.
    demo_restaurant_id: str = "00000000-0000-0000-0000-000000000001"

    class Config:
        env_file = ".env"


settings = Settings()
