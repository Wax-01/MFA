"""Cifrado en reposo del secreto TOTP.

No se puede hashear: el servidor necesita el secreto original como llave del HMAC-SHA1.
Se cifra con Fernet (AES-128-CBC + HMAC-SHA256, autenticado) usando una llave que vive en el
.env y no en la BD, así que leer mfa_configs no permite generar códigos.
"""
from cryptography.fernet import Fernet, InvalidToken

from . import config

_fernet = Fernet(config.TOTP_ENCRYPTION_KEY)

# Todo token Fernet empieza por el byte de versión 0x80 y un timestamp, que en base64url da "gAAAAA".
ENCRYPTED_PREFIX = "gAAAAA"


def encrypt_secret(secret: str) -> str:
    return _fernet.encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("No se pudo descifrar el secreto TOTP: ¿cambió TOTP_ENCRYPTION_KEY?") from exc


def is_encrypted(value: str) -> bool:
    return value.startswith(ENCRYPTED_PREFIX)
