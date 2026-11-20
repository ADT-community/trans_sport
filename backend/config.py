"""Configuration for the trans_sport backend."""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _default_db_url() -> str:
    configured = os.getenv("DATABASE_URL")
    if configured:
        return configured
    data_dir = PROJECT_ROOT / "backend" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{data_dir / 'trans_sport.db'}"


DATABASE_URL = _default_db_url()
CITY_TIMEZONE = os.getenv("CITY_TIMEZONE", "Africa/Lagos")
CURRENCY = os.getenv("CURRENCY", "NGN")
OTP_TTL_SECONDS = int(os.getenv("OTP_TTL_SECONDS", "300"))
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "86400"))
MAX_OTP_ATTEMPTS = int(os.getenv("MAX_OTP_ATTEMPTS", "5"))
CREATE_TABLES = os.getenv("CREATE_TABLES", "1") not in ("0", "false", "False")
SEED_DEMO = os.getenv("SEED_DEMO", "1") not in ("0", "false", "False")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
