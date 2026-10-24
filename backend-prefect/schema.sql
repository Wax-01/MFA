-- Esquema propio para no chocar con las tablas de otros proyectos en la misma BD de Supabase.
CREATE SCHEMA IF NOT EXISTS mfa_lab;

CREATE TABLE IF NOT EXISTS mfa_lab.users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Máquina de estados del 2FA: la ausencia de fila equivale a NOT_ENROLLED.
CREATE TABLE IF NOT EXISTS mfa_lab.mfa_configs (
    user_id      BIGINT PRIMARY KEY REFERENCES mfa_lab.users (id) ON DELETE CASCADE,
    totp_secret  TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mfa_lab.backup_codes (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id   BIGINT NOT NULL REFERENCES mfa_lab.users (id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at   TIMESTAMPTZ,
    UNIQUE (user_id, code_hash)
);
