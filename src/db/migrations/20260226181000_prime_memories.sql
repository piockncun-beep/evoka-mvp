-- 20260226181000_prime_memories.sql
-- PRIME embeddings and analysis per memory

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS prime_memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id uuid NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
    summary text NOT NULL,
    emotion text NOT NULL,
    topics text[] NOT NULL DEFAULT '{}',
    question text NOT NULL,
    embedding_raw vector(1536) NOT NULL,
    embedding_normalized vector(1536) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prime_memories_memory_id
    ON prime_memories (memory_id);

CREATE INDEX IF NOT EXISTS idx_prime_memories_embedding_norm_ivfflat
    ON prime_memories USING ivfflat (embedding_normalized vector_cosine_ops) WITH (lists = 100);

ANALYZE prime_memories;
