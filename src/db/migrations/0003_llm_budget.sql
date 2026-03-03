-- 0003_llm_budget.sql
-- Tabla para controlar presupuesto mensual de OpenAI

CREATE TABLE IF NOT EXISTS llm_budget (
    month text PRIMARY KEY,
    usd_spent numeric(10,4) NOT NULL DEFAULT 0,
    usd_limit numeric(10,2) NOT NULL DEFAULT 5,
    updated_at timestamptz NOT NULL DEFAULT now()
);
