"""Application configuration.

DATABASE_URL is optional: when it is empty the app falls back to a local
SQLite file so the prototype runs with zero database setup. All models are
written to be PostgreSQL compatible, so pointing DATABASE_URL at Postgres
is the only change needed for a real deployment.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()

class Settings:
    APP_NAME = "Kabadiwala Connect API"
    VERSION = "1.0.0"
    DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'kabadiwala.db'}"
    SECRET_KEY = os.environ.get("SECRET_KEY", "kabadiwala-connect-prototype-secret")
    CORS_ORIGINS = [
        o.strip()
        for o in os.environ.get(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if o.strip()
    ]
    TOKEN_TTL_SECONDS = 60 * 60 * 12
    UPLOAD_DIR = BASE_DIR / "uploads"


settings = Settings()
settings.UPLOAD_DIR.mkdir(exist_ok=True)
