"""Strategy Pattern para el segundo factor: TOTP o código de respaldo, intercambiables."""
import hmac
from abc import ABC, abstractmethod
from dataclasses import dataclass

from . import db, totp
from .security import hash_backup_code


@dataclass(frozen=True)
class MfaContext:
    user_id: int
    username: str
    totp_secret: str | None
    status: str


@dataclass(frozen=True)
class VerificationResult:
    ok: bool
    detail: str


class SecondFactorStrategy(ABC):
    name: str

    def normalize(self, code: str) -> str:
        return code.strip().replace(" ", "")

    @abstractmethod
    def verify(self, ctx: MfaContext, code: str) -> VerificationResult: ...


class TOTPStrategy(SecondFactorStrategy):
    name = "totp"
    # Se evalúa primero C para que un reloj sincronizado registre "C".
    WINDOWS = ((0, "C"), (-1, "C-1"), (1, "C+1"))
    SKEW_HINT = {"C": "reloj sincronizado", "C-1": "reloj del celular ~30 s atrasado", "C+1": "reloj del celular ~30 s adelantado"}

    def verify(self, ctx: MfaContext, code: str) -> VerificationResult:
        if not ctx.totp_secret or not (code.isdigit() and len(code) == totp.DIGITS):
            return VerificationResult(False, "formato inválido")
        counter = totp.current_counter()
        for offset, label in self.WINDOWS:
            if hmac.compare_digest(totp.hotp(ctx.totp_secret, counter + offset), code):
                return VerificationResult(True, label)
        return VerificationResult(False, "sin coincidencia en C-1, C, C+1")


class BackupCodeStrategy(SecondFactorStrategy):
    name = "backup"

    def normalize(self, code: str) -> str:
        return super().normalize(code).replace("-", "").upper()

    def verify(self, ctx: MfaContext, code: str) -> VerificationResult:
        # El consumo es atómico en BD (UPDATE ... WHERE used_at IS NULL): un solo uso real.
        if not db.consume_backup_code(ctx.user_id, hash_backup_code(code)):
            return VerificationResult(False, "código de respaldo inexistente o ya usado")
        return VerificationResult(True, f"código de respaldo consumido, quedan {db.remaining_backup_codes(ctx.user_id)}")


STRATEGIES: dict[str, SecondFactorStrategy] = {s.name: s for s in (TOTPStrategy(), BackupCodeStrategy())}
