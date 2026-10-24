"""Repositorio sobre Postgres de Supabase (schema mfa_lab) con un pool pequeño de conexiones."""
import logging
from pathlib import Path

from psycopg import errors as pg_errors
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config
from .crypto import ENCRYPTED_PREFIX, decrypt_secret, encrypt_secret
from .errors import MfaStateError, UsernameTaken
from .security import BACKUP_HASH_PREFIX, pepper_backup_hash

logger = logging.getLogger("uvicorn.error")

SCHEMA_SQL = Path(__file__).resolve().parent.parent / "schema.sql"

_pool: ConnectionPool | None = None


def _configure(conn) -> None:
    conn.execute("SET search_path TO mfa_lab")


def open_pool() -> None:
    global _pool
    _pool = ConnectionPool(
        config.DATABASE_URL,
        min_size=1,
        max_size=4,
        kwargs={"autocommit": True, "row_factory": dict_row},
        configure=_configure,
        open=True,
    )
    with _pool.connection() as conn:
        conn.execute(SCHEMA_SQL.read_text(encoding="utf-8"))
    migrate_legacy_secrets()


def migrate_legacy_secrets() -> None:
    """Migración idempotente de filas creadas antes del cifrado: los usuarios existentes siguen funcionando."""
    with _conn() as conn, conn.transaction():
        plain = conn.execute(
            "SELECT user_id, totp_secret FROM mfa_configs WHERE totp_secret NOT LIKE %s", (ENCRYPTED_PREFIX + "%",)
        ).fetchall()
        for row in plain:
            conn.execute("UPDATE mfa_configs SET totp_secret = %s WHERE user_id = %s", (encrypt_secret(row["totp_secret"]), row["user_id"]))
        legacy = conn.execute(
            "SELECT id, code_hash FROM backup_codes WHERE code_hash NOT LIKE %s", (BACKUP_HASH_PREFIX + "%",)
        ).fetchall()
        for row in legacy:
            conn.execute("UPDATE backup_codes SET code_hash = %s WHERE id = %s", (pepper_backup_hash(row["code_hash"]), row["id"]))
    if plain or legacy:
        logger.info("Migración de secretos: %d secretos TOTP cifrados, %d códigos de respaldo con pepper", len(plain), len(legacy))


def close_pool() -> None:
    if _pool:
        _pool.close()


def _conn():
    assert _pool is not None, "Pool no inicializado"
    return _pool.connection()


def create_user(username: str, password_hash: str) -> dict:
    try:
        with _conn() as conn:
            return conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id, username",
                (username, password_hash),
            ).fetchone()
    except pg_errors.UniqueViolation as exc:
        raise UsernameTaken("Ese usuario ya existe") from exc


def get_user_with_mfa(username: str) -> dict | None:
    with _conn() as conn:
        return conn.execute(
            """SELECT u.id, u.username, u.password_hash, COALESCE(m.status, 'NOT_ENROLLED') AS mfa_status
               FROM users u LEFT JOIN mfa_configs m ON m.user_id = u.id
               WHERE u.username = %s""",
            (username,),
        ).fetchone()


def get_mfa_config(user_id: int) -> dict | None:
    """Devuelve el secreto TOTP ya descifrado: solo existe en claro en memoria durante la petición."""
    with _conn() as conn:
        row = conn.execute(
            """SELECT u.id AS user_id, u.username, m.totp_secret, COALESCE(m.status, 'NOT_ENROLLED') AS status
               FROM users u LEFT JOIN mfa_configs m ON m.user_id = u.id
               WHERE u.id = %s""",
            (user_id,),
        ).fetchone()
    if row and row["totp_secret"]:
        row["totp_secret"] = decrypt_secret(row["totp_secret"])
    return row


def save_pending_config(user_id: int, totp_secret: str, backup_hashes: list[str]) -> None:
    """Crea o reemplaza la configuración PENDING_VERIFICATION. Nunca pisa una ACTIVE."""
    with _conn() as conn, conn.transaction():
        row = conn.execute(
            """INSERT INTO mfa_configs (user_id, totp_secret, status) VALUES (%s, %s, 'PENDING_VERIFICATION')
               ON CONFLICT (user_id) DO UPDATE
                   SET totp_secret = EXCLUDED.totp_secret, created_at = now()
                   WHERE mfa_configs.status = 'PENDING_VERIFICATION'
               RETURNING user_id""",
            (user_id, encrypt_secret(totp_secret)),
        ).fetchone()
        if row is None:
            raise MfaStateError("El 2FA ya está ACTIVE; no se puede re-aprovisionar")
        conn.execute("DELETE FROM backup_codes WHERE user_id = %s", (user_id,))
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO backup_codes (user_id, code_hash) VALUES (%s, %s)",
                [(user_id, h) for h in backup_hashes],
            )


def activate_config(user_id: int) -> bool:
    with _conn() as conn:
        row = conn.execute(
            """UPDATE mfa_configs SET status = 'ACTIVE', activated_at = now()
               WHERE user_id = %s AND status = 'PENDING_VERIFICATION' RETURNING user_id""",
            (user_id,),
        ).fetchone()
        return row is not None


def consume_backup_code(user_id: int, code_hash: str) -> bool:
    with _conn() as conn:
        row = conn.execute(
            """UPDATE backup_codes SET used_at = now()
               WHERE user_id = %s AND code_hash = %s AND used_at IS NULL RETURNING id""",
            (user_id, code_hash),
        ).fetchone()
        return row is not None


def remaining_backup_codes(user_id: int) -> int:
    with _conn() as conn:
        return conn.execute(
            "SELECT count(*) AS n FROM backup_codes WHERE user_id = %s AND used_at IS NULL", (user_id,)
        ).fetchone()["n"]
