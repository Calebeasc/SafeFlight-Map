from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_env: str = "dev"
    host: str = "127.0.0.1"
    port: int = 8000
    database_url: str = "sqlite:///./scanner_map.db"
    hmac_secret: str = "change-me"
    frontend_dist: str = "frontend/dist"
    allowlist_file: str = "backend/targets.json"

settings = Settings()
# .../scanner-map/backend/src/app/config.py -> repo root is parents[3]
BASE_DIR = Path(__file__).resolve().parents[3]
