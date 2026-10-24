"""Excepciones de dominio. Se lanzan dentro de las tasks de Prefect para que el run quede en Failed."""


class AuthError(Exception):
    status_code = 401


class InvalidCredentials(AuthError):
    pass


class InvalidToken(AuthError):
    pass


class InsufficientScope(AuthError):
    status_code = 403


class InvalidSecondFactor(AuthError):
    pass


class ReplayAttackDetected(AuthError):
    status_code = 409


class MfaStateError(AuthError):
    status_code = 409


class UsernameTaken(AuthError):
    status_code = 409
