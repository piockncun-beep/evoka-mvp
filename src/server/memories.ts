
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import z from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { authMiddleware } from './auth.js';
import { db } from './db.js';
import { memories as memoriesTable } from '../db/schema/memories.js';
import { embedText, EMBEDDING_DIM } from './lib/prime/index.js';
const router = Router();
router.use(authMiddleware);


// Rate limit simple in-memory por userId
const rateLimitMap = new Map<string, { count: number; ts: number }>();
function rateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxReq = 30;
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.ts > windowMs) {
    rateLimitMap.set(userId, { count: 1, ts: now });
    return false;
  }
  if (entry.count >= maxReq) return true;
  entry.count++;
  return false;
}

// POST /api/memories/:id/feedback
router.post('/:id/feedback', async (req: Request, res) => {
  const userId = req.auth!.userId;
  const { id } = req.params;
  const schema = z.object({
    signal: z.boolean(),
    comment: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body' });
  }
  // Insertar evento feedback
  await db.execute(sql`
    INSERT INTO app_events (user_id, memory_id, event, signal, comment, created_at)
    VALUES (${userId}, ${id}, ${parsed.data.signal ? 'prime_thumb_up' : 'prime_thumb_down'}, ${parsed.data.signal}, ${parsed.data.comment || null}, now())
  `);
  res.json({ ok: true });
});

// POST /api/memories/search
router.post('/search', async (req: Request, res) => {
  const userId = req.auth!.userId;
  if (rateLimit(userId)) {
    return res.status(429).json({ error: 'Demasiadas búsquedas recientes. Intenta en unos minutos.' });
  }
  const schema = z.object({
    query: z.string().min(1).max(10000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Consulta inválida.' });
  }
  const { query } = parsed.data;
  let embeddingRes;
  try {
    embeddingRes = await embedText(query);
  } catch (err) {
    embeddingRes = { vector: Array(EMBEDDING_DIM).fill(0), provider: 'fallback_error', usage: {}, latency_ms: 0 };
  }
  const embedding_normalized = embeddingRes.vector;
  const results = await db.execute(sql`
    SELECT
      m.id,
      m.content,
      m.created_at,
      pm.summary,
      pm.emotion,
      pm.topics,
      pm.question,
      1 - (pm.embedding_normalized <=> ${embedding_normalized}) AS similarity
    FROM prime_memories pm
    JOIN memories m ON m.id = pm.memory_id
    WHERE m.author_id = ${userId}
    ORDER BY pm.embedding_normalized <=> ${embedding_normalized} ASC
    LIMIT 10;
  `);
  // Log app_events
  await db.execute(sql`
    INSERT INTO app_events (user_id, event, meta, created_at)
    VALUES (
      ${userId},
      'semantic_search_used',
      ${JSON.stringify({
        provider: embeddingRes.provider,
        budget_month: embeddingRes.usage?.budget_month,
        estimated_usd: embeddingRes.usage?.estimated_usd,
        real_usd: embeddingRes.usage?.real_usd,
        usage_tokens: embeddingRes.usage?.usage,
        model: process.env.EMBEDDING_MODEL,
        latency_ms: embeddingRes.latency_ms,
        query_length: query.length,
        result_count: results.rows?.length || 0
      })},
      now()
    )
  `);
  res.json({ results: results.rows || [] });
});

// POST /api/memories
const createMemorySchema = z.object({
  content: z.string().min(1).max(20000),
  title: z.string().min(1).max(120).optional(),
  privacy: z.enum(['private', 'dedicated', 'public', 'executor']).default('private'),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
  destiny: z.string().default('self'),
}).strict();

router.post('/', async (req: Request, res) => {
  const requestId = randomUUID();
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const parsed = createMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      details: parsed.error.flatten(),
    });
  }

  const idempotencyKeyHeader = req.get('Idempotency-Key');
  const idempotencyKey = idempotencyKeyHeader?.trim() || undefined;
  const { content, title, privacy, status, destiny } = parsed.data;

  try {
    if (idempotencyKey) {
      const [existing] = await db.select().from(memoriesTable).where(and(
        eq(memoriesTable.authorId, userId),
        eq(memoriesTable.idempotencyKey, idempotencyKey)
      )).limit(1);
      if (existing) {
        return res.status(200).json({ memory: existing, idempotent: true });
      }

      const [inserted] = await db.insert(memoriesTable).values({
        authorId: userId,
        title,
        content,
        privacy,
        status,
        destiny,
        idempotencyKey,
      }).onConflictDoNothing({
        target: [memoriesTable.authorId, memoriesTable.idempotencyKey],
      }).returning();

      if (inserted) {
        return res.status(201).json({ memory: inserted });
      }

      const [existingAfterConflict] = await db.select().from(memoriesTable).where(and(
        eq(memoriesTable.authorId, userId),
        eq(memoriesTable.idempotencyKey, idempotencyKey)
      )).limit(1);
      if (existingAfterConflict) {
        return res.status(200).json({ memory: existingAfterConflict, idempotent: true });
      }

      throw new Error('Idempotent insert failed without existing row');
    }

    const [memory] = await db.insert(memoriesTable).values({
      authorId: userId,
      title,
      content,
      privacy,
      status,
      destiny,
      idempotencyKey,
    }).returning();

    return res.status(201).json({ memory });
  } catch (error) {
    console.error('POST /api/memories failed', { requestId, error });
    return res.status(500).json({ error: 'INTERNAL_ERROR', requestId });
  }
});

export default router;