"""Hash de contraseñas, códigos de respaldo y tokens JWT (pre_auth vs access)."""
import hashlib
import hmac
import secrets
import time
import uuid

import jwt

from . import config
from .errors import InsufficientScope, InvalidToken

PBKDF2_ITERATIONS = 200_000

# Tipos y scopes de token: el pre_auth_token solo sirve para el siguiente paso del login.
PRE_AUTH = "pre_auth"
ACCESS = "access"
SCOPE_VERIFY = "mfa:verify"   # 2FA ACTIVE  -> solo POST /auth/verify-2fa
SCOPE_ENROLL = "mfa:enroll"   # 2FA no ACTIVE -> solo POST /2fa/enroll y /2fa/activate
SCOPE_VAULT = "vault:read"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, iterations, salt_hex, dk_hex = stored.split("$")
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    return hmac.compare_digest(dk.hex(), dk_hex)


# Hash señuelo para que un usuario inexistente tarde lo mismo que una contraseña errada.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_hex(8))

_BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I


def generate_backup_codes(n: int = 8) -> list[str]:
    codes = []
    for _ in range(n):
        raw = "".join(secrets.choice(_BACKUP_ALPHABET) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


BACKUP_HASH_PREFIX = "hmac-sha256$"


def hash_backup_code(normalized_code: str) -> str:
    # Un código tiene ~40 bits: con SHA-256 a secas, una BD filtrada se rompe por fuerza bruta en horas.
    # El HMAC con un pepper que no está en la BD hace inútil ese ataque offline.
    return pepper_backup_hash(hashlib.sha256(normalized_code.encode()).hexdigest())


def pepper_backup_hash(sha256_hex: str) -> str:
    """HMAC sobre el SHA-256 del código: permite migrar los hashes antiguos sin conocer los códigos."""
    mac = hmac.new(config.BACKUP_CODE_PEPPER.encode(), sha256_hex.encode(), hashlib.sha256).hexdigest()
    return BACKUP_HASH_PREFIX + mac


def issue_token(typ: str, user_id: int, username: str, scope: str, ttl_s: int, **claims) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "username": username,
        "typ": typ,
        "scope": scope,
        "iat": now,
        "exp": now + ttl_s,
        "jti": uuid.uuid4().hex,
        **claims,
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def decode_token(token: str, expected_typ: str, allowed_scopes: set[str]) -> dict:
    try:
        claims = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"], options={"require": ["exp", "sub", "typ"]})
    except jwt.ExpiredSignatureError as exc:
        raise InvalidToken("El token expiró") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidToken("Token inválido") from exc
    if claims["typ"] != expected_typ:
        raise InvalidToken(f"Se esperaba un token '{expected_typ}' y llegó uno '{claims['typ']}'")
    if claims.get("scope") not in allowed_scopes:
        raise InsufficientScope(f"El scope '{claims.get('scope')}' no permite esta operación")
    return claims
