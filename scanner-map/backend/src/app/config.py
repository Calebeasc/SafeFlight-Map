from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_env: str = "dev"
    host: str = "127.0.0.1"
    port: int = 8000
    hmac_secret: str = "change-me"

settings = Settings()
