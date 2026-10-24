"""API FastAPI. Cada endpoint de autenticación delega en un @flow de Prefect."""
from . import config  # noqa: F401  (debe ir antes de cualquier import de prefect)

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, SecretStr

from . import db, flows, security
from .errors import AuthError


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.open_pool()
    yield
    db.close_pool()


app = FastAPI(title="MFA Lab — Step-Up Auth + Prefect", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
bearer = HTTPBearer()


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: SecretStr = Field(min_length=8, max_length=128)


class CodeIn(BaseModel):
    code: SecretStr = Field(min_length=6, max_length=16)


class VerifyIn(CodeIn):
    method: Literal["totp", "backup"] = "totp"


def _run(flow_fn, **params) -> dict:
    """Ejecuta el flow, adjunta el enlace al run en Prefect y traduce errores de dominio a HTTP."""
    state = flow_fn(**params, return_state=True)
    run_url = f"{config.PREFECT_UI_URL}/runs/flow-run/{state.state_details.flow_run_id}"
    try:
        result = state.result()
    except AuthError as exc:
        raise HTTPException(
            exc.status_code,
            {"error": type(exc).__name__, "message": str(exc), "prefect_flow_run_url": run_url},
        ) from exc
    return {**result, "prefect_flow_run_url": run_url}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register", status_code=201)
def register(body: Credentials):
    try:
        return db.create_user(body.username, security.hash_password(body.password.get_secret_value()))
    except AuthError as exc:
        raise HTTPException(exc.status_code, {"error": type(exc).__name__, "message": str(exc)}) from exc


@app.post("/auth/login")
def login(body: Credentials):
    return _run(flows.login_flow, username=body.username, password=body.password)


@app.post("/2fa/enroll")
def enroll(auth: HTTPAuthorizationCredentials = Depends(bearer)):
    return _run(flows.provision_2fa_flow, pre_auth_token=SecretStr(auth.credentials))


@app.post("/2fa/activate")
def activate(body: CodeIn, auth: HTTPAuthorizationCredentials = Depends(bearer)):
    return _run(flows.activate_2fa_flow, pre_auth_token=SecretStr(auth.credentials), code=body.code)


@app.post("/auth/verify-2fa")
def verify_2fa(body: VerifyIn, auth: HTTPAuthorizationCredentials = Depends(bearer)):
    return _run(flows.verify_2fa_flow, pre_auth_token=SecretStr(auth.credentials), code=body.code, method=body.method)


def require_mfa_session(auth: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Solo acepta access_token con mfa_verified=true; un pre_auth_token es rechazado."""
    try:
        claims = security.decode_token(auth.credentials, security.ACCESS, {security.SCOPE_VAULT})
    except AuthError as exc:
        raise HTTPException(exc.status_code, {"error": type(exc).__name__, "message": str(exc)}) from exc
    if claims.get("mfa_verified") is not True:
        raise HTTPException(403, {"error": "MfaRequired", "message": "Se requiere sesión con mfa_verified=true"})
    return claims


@app.get("/api/boveda-secreta")
def boveda_secreta(claims: dict = Depends(require_mfa_session)):
    return {
        "message": f"Bienvenido a la bóveda secreta, {claims['username']}",
        "secret": "La respuesta es 42 — protegido por 2FA TOTP (RFC 6238)",
        "claims": {k: claims[k] for k in ("sub", "username", "scope", "mfa_verified", "amr", "mfa_window", "exp") if k in claims},
    }
