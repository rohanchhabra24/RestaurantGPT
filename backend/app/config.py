from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_db_url: str
    supabase_url: str = ""
    supabase_service_key: str = ""

    anthropic_api_key: str
    router_model: str = "claude-haiku-4-5-20251001"
    sql_model: str = "claude-sonnet-5"
    synthesis_model: str = "claude-sonnet-5"

    demo_restaurant_id: str = "00000000-0000-0000-0000-000000000001"

    class Config:
        env_file = ".env"


settings = Settings()
