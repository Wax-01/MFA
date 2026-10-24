# MFA Lab — 2FA TOTP desde cero + Step-Up Auth + Prefect

Prueba de concepto del curso **Patrones Arquitectónicos Avanzados**.

```
MFA/
├── backend-prefect/        API FastAPI + flows/tasks de Prefect + Postgres (Supabase, schema mfa_lab)
└── mobile-authenticator/   Un solo proyecto Expo (React Native):
                              · en el celular → Kawase Authenticator (TOTP propio, offline)
                              · en el navegador → Kawase, app de inversiones y divisas
                                (login + MFA real; el dashboard posterior usa datos de ejemplo)
```

La interfaz sigue una identidad propia, «Kawase» (為替, «tipo de cambio»), inspirada en el proyecto UNiiK de Behance:
negro, blanco hueso y rojo, tipografía Hanken Grotesk y un motivo de elipses que se expanden. Los detalles técnicos
(tokens, enlaces a Prefect) no se muestran en la UI: se observan en el dashboard de Prefect.

## Arquitectura

```
 Navegador (Expo web)                 Backend FastAPI                     Prefect UI :4200
 ─────────────────────               ──────────────────                  ────────────────
 POST /auth/login ───────────────▶  flow login-password ──────────────▶ authenticate_credentials
   ◀── pre_auth_token (scope           (no da acceso a la bóveda)         issue_pre_auth_token
       mfa:verify | mfa:enroll)

 POST /2fa/enroll ───────────────▶  flow provision-2fa ───────────────▶ validate_pre_auth_state
   ◀── QR otpauth:// + códigos          estado → PENDING_VERIFICATION      create_pending_configuration
       de respaldo                                                         build_provisioning_qr
 POST /2fa/activate ─────────────▶  flow activate-2fa  ───────────────▶ … → transition_to_active (→ ACTIVE)

 POST /auth/verify-2fa ──────────▶  flow verify-2fa ──────────────────▶ 1 validate_pre_auth_state
   ◀── access_token                                                      2 check_anti_replay_cache
       (mfa_verified: true)                                              3 execute_mfa_strategy
 GET /api/boveda-secreta                                                 4 issue_elevated_session

 Celular en modo avión: HMAC-SHA1(secreto, floor(unix/30)) → truncamiento dinámico → 6 dígitos
```

| Patrón | Dónde |
|---|---|
| **Process Manager / Máquina de estados** | `backend-prefect/app/mfa_state.py` (`NOT_ENROLLED → PENDING_VERIFICATION → ACTIVE`). Un QR nunca escaneado no bloquea: el usuario sigue `PENDING` y puede regenerarlo. Un `ACTIVE` nunca se re-aprovisiona (también protegido en SQL). |
| **Step-Up Authentication** | `app/security.py`: `pre_auth_token` (`typ=pre_auth`, 5 min, scope `mfa:verify` o `mfa:enroll`) vs `access_token` (`typ=access`, scope `vault:read`, `mfa_verified: true`, `amr`). La bóveda rechaza cualquier token que no sea `access` con `mfa_verified=true`. |
| **Strategy** | `app/strategies.py`: `SecondFactorStrategy` → `TOTPStrategy` (ventanas C, C-1, C+1) y `BackupCodeStrategy` (códigos de un solo uso, HMAC-SHA256 con pepper, consumo atómico en BD). |
| **Secretos en reposo** | Contraseñas: PBKDF2-SHA256 (200 000 iteraciones, salt por usuario). Secreto TOTP: **cifrado** con Fernet (`app/crypto.py`), no hasheado, porque el servidor lo necesita para el HMAC. Códigos de respaldo: `HMAC(pepper, SHA-256(código))`. `TOTP_ENCRYPTION_KEY` y `BACKUP_CODE_PEPPER` viven en `.env`, nunca en la BD. |
| **Anti-replay / idempotencia** | `app/replay_cache.py`: dict en memoria `(user_id, código) → expira en 90 s` (cubre las 3 ventanas). `issue_elevated_session` vuelve a comprobar de forma atómica al marcar, lo que cierra la carrera de dos peticiones simultáneas. |
| **Observabilidad** | `app/flows.py`: `@flow` / `@task` con `get_run_logger()`. Los parámetros sensibles son `SecretStr`, así que Prefect los muestra como `**********`. Cada respuesta de la API trae `prefect_flow_run_url`. |

TOTP sin librerías: el backend usa solo `hmac`/`hashlib`/`base64` de la stdlib (`app/totp.py`), y la app
implementa SHA-1, HMAC, Base32 y el truncamiento en TypeScript puro (`mobile-authenticator/src/totp.ts`).
Ambas implementaciones se verificaron contra los vectores de RFC 4226, RFC 6238 y RFC 2202 y entre sí.

## Requisitos

- Python 3.11+ (probado con 3.13) · Node 20+ (probado con 22) · celular con **Expo Go** (SDK 58) en la misma Wi-Fi que el PC.
- Base de datos: Postgres de Supabase. Las tablas se crean solas al arrancar el backend, en el schema `mfa_lab`
  (no toca las tablas de otros proyectos). El SQL está en `backend-prefect/schema.sql`.

## Puesta en marcha (3 terminales)

### 1. Servidor de Prefect
```powershell
cd backend-prefect
python -m venv .venv            # solo la primera vez
.venv\Scripts\pip install -r requirements.txt   # solo la primera vez
.venv\Scripts\prefect server start
```
UI en http://127.0.0.1:4200

### 2. Backend
```powershell
cd backend-prefect
# Solo si .env NO existe (en un clon nuevo): copiar la plantilla y poner DATABASE_URL y JWT_SECRET reales.
# if (-not (Test-Path .env)) { copy .env.example .env }
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Docs interactivas en http://localhost:8000/docs. `--host 0.0.0.0` permite que el celular también lo alcance.

### 3. App (web + móvil)
```powershell
cd mobile-authenticator
npm install                     # solo la primera vez
npx expo start
```
- Presiona **`w`** para abrir la **app web** (http://localhost:8081).
- Escanea el QR de la terminal con **Expo Go** para abrir el **Authenticator** en el celular.
- Sin celular a mano: http://localhost:8081/?authenticator abre el Authenticator en el navegador.
- Si el celular no conecta: permite Node.js en el Firewall de Windows (red privada) o usa `npx expo start --tunnel`.

## Guion de la demo (pruebas de aceptación)

1. **Registro y aprovisionamiento.** En la web: *¿No tienes cuenta? Crear una*. Como el 2FA no está activo, la app
   llama a `POST /2fa/enroll` (estado `PENDING_VERIFICATION`, visible en el flow `provision-2fa`) y muestra
   *Protege tu cuenta* con el QR.
2. **Paridad estándar.** Escanea el mismo QR con el Authenticator propio y con Google o Microsoft Authenticator: ambos
   muestran los mismos 6 dígitos. Escribe el código y el estado pasa a `ACTIVE` (flow `activate-2fa`). Luego se
   muestran los 8 códigos de respaldo y, con *Ya los guardé*, la app vuelve a iniciar sesión y pide el código.
3. **Modo avión.** Con la app ya abierta, activa el modo avión y espera a que cambie la ventana de 30 s. Escribe el
   código del celular en la web: la app valida el `access_token` contra `GET /api/boveda-secreta` y abre el dashboard.
   *(Expo Go puede mostrar "disconnected from Metro"; no importa, el cálculo es local).*
4. **Anti-replay.** *Cerrar sesión* → entra de nuevo con usuario y contraseña y escribe **el mismo código** antes de
   90 s. La app muestra «Ese código ya se usó» y en Prefect el flow `verify-2fa-totp` queda en rojo, fallido en
   `check_anti_replay_cache`.
5. **Clock skew o respaldo.** En los logs de la task `execute_mfa_strategy` se ve, por ejemplo,
   `TOTP válido en la ventana C-1 … reloj del celular ~30 s atrasado`. Para forzarlo, escribe un código justo después
   de que cambie. También puedes elegir *Usar un código de respaldo*: entra una vez y la segunda falla.

## Endpoints

| Método | Ruta | Auth | Flow |
|---|---|---|---|
| POST | `/auth/register` | — | — |
| POST | `/auth/login` | — | `login-password` |
| POST | `/2fa/enroll` | `pre_auth` (`mfa:enroll`) | `provision-2fa` |
| POST | `/2fa/activate` | `pre_auth` (`mfa:enroll`) | `activate-2fa` |
| POST | `/auth/verify-2fa` `{code, method: totp\|backup}` | `pre_auth` (`mfa:verify`) | `verify-2fa` |
| GET | `/api/boveda-secreta` | `access` + `mfa_verified=true` | — |

## Limitaciones conocidas (alcance de laboratorio)

- La caché anti-replay vive en memoria: se pierde al reiniciar y no se comparte entre varios workers de uvicorn
  (en producción iría en Redis con `SET NX EX 90`).
- Las llaves de cifrado están en `.env`; en producción irían en un KMS o vault y se rotarían (`MultiFernet`).
  Si se pierde `TOTP_ENCRYPTION_KEY` o `BACKUP_CODE_PEPPER`, los usuarios deben volver a configurar su 2FA.
- No hay límite de intentos fallidos por `pre_auth_token`.
