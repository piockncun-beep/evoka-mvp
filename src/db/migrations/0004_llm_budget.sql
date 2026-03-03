-- Migration: Create llm_budget table
CREATE TABLE IF NOT EXISTS llm_budget (
    month TEXT PRIMARY KEY,
    usd_spent NUMERIC(10,4) NOT NULL DEFAULT 0,
    usd_limit NUMERIC(10,2) NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
