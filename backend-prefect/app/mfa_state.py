"""Máquina de estados del aprovisionamiento 2FA (Process Manager).

NOT_ENROLLED ──enroll──▶ PENDING_VERIFICATION ──primer código válido──▶ ACTIVE
                              │  ▲
                              └──┘ re-enroll (QR nuevo si nunca se escaneó)

Mientras el estado no sea ACTIVE el login no exige el segundo factor para *activar*,
así un QR generado y nunca escaneado no deja al usuario bloqueado.
"""
from enum import StrEnum

from .errors import MfaStateError


class MfaStatus(StrEnum):
    NOT_ENROLLED = "NOT_ENROLLED"  # virtual: no existe fila en mfa_configs
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    ACTIVE = "ACTIVE"


TRANSITIONS: dict[MfaStatus, set[MfaStatus]] = {
    MfaStatus.NOT_ENROLLED: {MfaStatus.PENDING_VERIFICATION},
    MfaStatus.PENDING_VERIFICATION: {MfaStatus.PENDING_VERIFICATION, MfaStatus.ACTIVE},
    MfaStatus.ACTIVE: set(),
}


def ensure_transition(current: MfaStatus, target: MfaStatus) -> None:
    if target not in TRANSITIONS[current]:
        raise MfaStateError(f"Transición inválida de 2FA: {current} -> {target}")
