"""Flows y tasks de Prefect: cada paso del pipeline de autenticación queda observable en la UI."""
from . import config  # noqa: F401  (carga .env, incl. PREFECT_API_URL, antes de importar prefect)

import segno
from prefect import flow, get_run_logger, task
from prefect.cache_policies import NO_CACHE
from pydantic import SecretStr

from . import db, security, totp
from .errors import InvalidCredentials, InvalidSecondFactor, InvalidToken, MfaStateError, ReplayAttackDetected
from .mfa_state import MfaStatus, ensure_transition
from .replay_cache import AntiReplayCache
from .strategies import STRATEGIES, MfaContext, TOTPStrategy, VerificationResult

replay_cache = AntiReplayCache(config.REPLAY_TTL_S)

# NO_CACHE: las entradas contienen secretos y cada intento debe ejecutarse de verdad.
auth_task = task(cache_policy=NO_CACHE)


# ───────────────────────────── Login (factor 1) ─────────────────────────────

@auth_task
def authenticate_credentials(username: str, password: SecretStr) -> dict:
    logger = get_run_logger()
    user = db.get_user_with_mfa(username)
    stored = user["password_hash"] if user else security.DUMMY_PASSWORD_HASH
    if not security.verify_password(password.get_secret_value(), stored) or user is None:
        logger.warning("Credenciales inválidas para '%s'", username)
        raise InvalidCredentials("Usuario o contraseña incorrectos")
    logger.info("Factor 1 OK para '%s' (estado 2FA: %s)", username, user["mfa_status"])
    return {"id": user["id"], "username": user["username"], "mfa_status": user["mfa_status"]}


@auth_task
def issue_pre_auth_token(user: dict) -> dict:
    active = user["mfa_status"] == MfaStatus.ACTIVE
    scope = security.SCOPE_VERIFY if active else security.SCOPE_ENROLL
    token = security.issue_token(security.PRE_AUTH, user["id"], user["username"], scope, config.PRE_AUTH_TTL_S, mfa_verified=False)
    get_run_logger().info("pre_auth_token emitido con scope '%s' (sin acceso a recursos protegidos)", scope)
    return {
        "pre_auth_token": token,
        "expires_in": config.PRE_AUTH_TTL_S,
        "next_step": "VERIFY_2FA" if active else "ENROLL_2FA",
        "mfa_status": user["mfa_status"],
    }


@flow(name="login-password", flow_run_name="login-{username}")
def login_flow(username: str, password: SecretStr) -> dict:
    user = authenticate_credentials(username, password)
    return issue_pre_auth_token(user)


# ─────────────────────────── Tasks compartidas 2FA ──────────────────────────

@auth_task
def validate_pre_auth_state(pre_auth_token: SecretStr, scope: str) -> MfaContext:
    logger = get_run_logger()
    claims = security.decode_token(pre_auth_token.get_secret_value(), security.PRE_AUTH, {scope})
    row = db.get_mfa_config(int(claims["sub"]))
    if row is None:
        raise InvalidToken("El usuario del token ya no existe")
    ctx = MfaContext(row["user_id"], row["username"], row["totp_secret"], row["status"])
    logger.info("pre_auth_token válido: usuario '%s', scope '%s', estado 2FA %s", ctx.username, scope, ctx.status)
    return ctx


@auth_task
def check_anti_replay_cache(ctx: MfaContext, code: SecretStr) -> None:
    logger = get_run_logger()
    if replay_cache.was_used(ctx.user_id, code.get_secret_value()):
        logger.error("REPLAY: el código ya fue usado por '%s' en los últimos %ss", ctx.username, config.REPLAY_TTL_S)
        raise ReplayAttackDetected("Este código ya fue utilizado (posible ataque de repetición)")
    logger.info("Código no visto en los últimos %ss para '%s'", config.REPLAY_TTL_S, ctx.username)


@auth_task
def execute_mfa_strategy(ctx: MfaContext, method: str, code: SecretStr) -> VerificationResult:
    logger = get_run_logger()
    strategy = STRATEGIES[method]
    logger.info("Estrategia seleccionada: %s", type(strategy).__name__)
    result = strategy.verify(ctx, code.get_secret_value())
    if not result.ok:
        logger.warning("Segundo factor rechazado (%s): %s", method, result.detail)
        raise InvalidSecondFactor("Código de segundo factor inválido")
    if method == "totp":
        hint = TOTPStrategy.SKEW_HINT[result.detail]
        logger.info("TOTP válido en la ventana %s (contador base %s) -> %s", result.detail, totp.current_counter(), hint)
    else:
        logger.info("BackupCode válido: %s", result.detail)
    return result


def _mark_code_used(ctx: MfaContext, code: SecretStr) -> None:
    # Segunda comprobación atómica: cierra la carrera entre dos peticiones simultáneas con el mismo código.
    if not replay_cache.mark_used(ctx.user_id, code.get_secret_value()):
        raise ReplayAttackDetected("Este código ya fue utilizado (petición concurrente)")


# ─────────────────────── Verificación Step-Up (factor 2) ────────────────────

@auth_task
def issue_elevated_session(ctx: MfaContext, method: str, code: SecretStr, result: VerificationResult) -> dict:
    _mark_code_used(ctx, code)
    amr = ["pwd", "otp" if method == "totp" else "backup_code"]
    token = security.issue_token(
        security.ACCESS, ctx.user_id, ctx.username, security.SCOPE_VAULT, config.ACCESS_TTL_S,
        mfa_verified=True, amr=amr, mfa_window=result.detail if method == "totp" else None,
    )
    get_run_logger().info("Código marcado como usado; access_token emitido con mfa_verified=true (amr=%s)", amr)
    return {"access_token": token, "token_type": "bearer", "expires_in": config.ACCESS_TTL_S, "mfa_window": result.detail}


@flow(name="verify-2fa", flow_run_name="verify-2fa-{method}")
def verify_2fa_flow(pre_auth_token: SecretStr, code: SecretStr, method: str = "totp") -> dict:
    code = SecretStr(STRATEGIES[method].normalize(code.get_secret_value()))
    ctx = validate_pre_auth_state(pre_auth_token, security.SCOPE_VERIFY)
    check_anti_replay_cache(ctx, code)
    result = execute_mfa_strategy(ctx, method, code)
    return issue_elevated_session(ctx, method, code, result)


# ───────────────────── Aprovisionamiento (Process Manager) ──────────────────

@auth_task
def create_pending_configuration(ctx: MfaContext) -> dict:
    current = MfaStatus(ctx.status)
    ensure_transition(current, MfaStatus.PENDING_VERIFICATION)
    secret = totp.generate_secret()
    backup_codes = security.generate_backup_codes()
    norm = STRATEGIES["backup"].normalize
    db.save_pending_config(ctx.user_id, secret, [security.hash_backup_code(norm(c)) for c in backup_codes])
    get_run_logger().info("Estado 2FA: %s -> PENDING_VERIFICATION (%d códigos de respaldo generados)", current, len(backup_codes))
    return {"secret": secret, "backup_codes": backup_codes}


@auth_task
def build_provisioning_qr(username: str, secret: str) -> dict:
    uri = totp.otpauth_uri(secret, username, config.TOTP_ISSUER)
    get_run_logger().info("URI otpauth generada para '%s' (QR listo para escanear)", username)
    return {"otpauth_uri": uri, "qr_png": segno.make(uri, error="m").png_data_uri(scale=6, border=2)}


@flow(name="provision-2fa", flow_run_name="provision-2fa")
def provision_2fa_flow(pre_auth_token: SecretStr) -> dict:
    ctx = validate_pre_auth_state(pre_auth_token, security.SCOPE_ENROLL)
    config_data = create_pending_configuration(ctx)
    qr = build_provisioning_qr(ctx.username, config_data["secret"])
    return {**config_data, **qr, "status": MfaStatus.PENDING_VERIFICATION.value}


@auth_task
def transition_to_active(ctx: MfaContext, code: SecretStr) -> dict:
    ensure_transition(MfaStatus(ctx.status), MfaStatus.ACTIVE)
    if not db.activate_config(ctx.user_id):
        raise MfaStateError("La configuración ya no está en PENDING_VERIFICATION")
    _mark_code_used(ctx, code)
    get_run_logger().info("Estado 2FA: PENDING_VERIFICATION -> ACTIVE para '%s'", ctx.username)
    return {"status": MfaStatus.ACTIVE.value}


@flow(name="activate-2fa", flow_run_name="activate-2fa")
def activate_2fa_flow(pre_auth_token: SecretStr, code: SecretStr) -> dict:
    code = SecretStr(STRATEGIES["totp"].normalize(code.get_secret_value()))
    ctx = validate_pre_auth_state(pre_auth_token, security.SCOPE_ENROLL)
    if ctx.status != MfaStatus.PENDING_VERIFICATION:
        raise MfaStateError("Primero genera el QR (POST /2fa/enroll)")
    check_anti_replay_cache(ctx, code)
    result = execute_mfa_strategy(ctx, "totp", code)
    return {**transition_to_active(ctx, code), "mfa_window": result.detail}
