-- 0002_app_events.sql
-- Tabla para registrar eventos mínimos (feedback, creación, etc)

CREATE TABLE IF NOT EXISTS app_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    memory_id uuid,
    event text NOT NULL,
    signal boolean,
    comment text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_events_user ON app_events (user_id, created_at DESC);
