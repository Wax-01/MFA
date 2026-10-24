"""Configuración central. Se importa antes que Prefect para que PREFECT_API_URL del .env aplique."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
# Llaves que NUNCA se guardan en la BD: sin ellas, una copia robada de la BD no sirve.
TOTP_ENCRYPTION_KEY = os.environ["TOTP_ENCRYPTION_KEY"]  # Fernet: cifra mfa_configs.totp_secret
BACKUP_CODE_PEPPER = os.environ["BACKUP_CODE_PEPPER"]    # HMAC de backup_codes.code_hash

if "<" in DATABASE_URL or "cambia-esto" in (JWT_SECRET, TOTP_ENCRYPTION_KEY, BACKUP_CODE_PEPPER):
    raise RuntimeError("backend-prefect/.env aún tiene valores de ejemplo: revisa DATABASE_URL, JWT_SECRET, TOTP_ENCRYPTION_KEY y BACKUP_CODE_PEPPER")

PRE_AUTH_TTL_S = int(os.getenv("PRE_AUTH_TTL_S", "300"))
ACCESS_TTL_S = int(os.getenv("ACCESS_TTL_S", "900"))
REPLAY_TTL_S = int(os.getenv("REPLAY_TTL_S", "90"))

TOTP_ISSUER = os.getenv("TOTP_ISSUER", "Kawase")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:8081").split(",") if o.strip()]
PREFECT_UI_URL = os.getenv("PREFECT_UI_URL", "http://127.0.0.1:4200")
