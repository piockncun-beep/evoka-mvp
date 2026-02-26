import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MemoryRow = {
  id: string;
  authorId: string;
  title?: string;
  content: string;
  privacy: string;
  status: string;
  destiny: string;
  idempotencyKey?: string;
};

const memoryStore: MemoryRow[] = [];
const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => (memoryStore.length ? [memoryStore[0]] : []),
      }),
    }),
  }),
  insert: () => ({
    values: (values: Omit<MemoryRow, 'id'>) => {
      const buildRecord = () => ({
        id: `mem_${memoryStore.length + 1}`,
        ...values,
      });

      return {
        returning: () => {
          const record = buildRecord();
          memoryStore.push(record);
          return [record];
        },
        onConflictDoNothing: () => ({
          returning: () => {
            const existing = memoryStore.find(
              (row) => row.authorId === values.authorId && row.idempotencyKey === values.idempotencyKey
            );
            if (existing) {
              return [];
            }
            const record = buildRecord();
            memoryStore.push(record);
            return [record];
          },
        }),
      };
    },
  }),
};

vi.mock('../auth.js', () => ({
  authMiddleware: (req: { headers: { authorization?: string }; auth?: { userId: string } }, res: any, next: any) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    req.auth = { userId: 'user_test_123' };
    next();
  },
}));

vi.mock('../db.js', () => ({
  db: fakeDb,
}));

process.env.NODE_ENV = 'test';

const { app } = await import('../index.js');

describe('POST /api/memories', () => {
  beforeEach(() => {
    memoryStore.length = 0;
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/memories')
      .send({ content: 'hola' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer test')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('creates memory and returns authorId', async () => {
    const res = await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer test')
      .send({ content: 'Mi primera memoria.' });

    expect(res.status).toBe(201);
    expect(res.body.memory.authorId).toBe('user_test_123');
  });

  it('returns 200 idempotent for same key', async () => {
    const key = 'idem-key-123';

    const first = await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer test')
      .set('Idempotency-Key', key)
      .send({ content: 'Memoria repetible.' });

    const second = await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer test')
      .set('Idempotency-Key', key)
      .send({ content: 'Memoria repetible.' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.memory.id).toBe(first.body.memory.id);
  });
});
