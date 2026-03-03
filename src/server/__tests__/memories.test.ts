import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memories, users } from '../../db/schema/00_core.js';

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

type UserRow = {
  id: string;
  clerkUserId: string;
};

type MockAuthRequest = {
  headers: { authorization?: string };
  auth?: { userId: string };
};

type MockAuthResponse = {
  status: (code: number) => {
    json: (body: unknown) => unknown;
  };
};

const memoryStore: MemoryRow[] = [];
const userStore: UserRow[] = [];
const fakeDb = {
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: () => (table === memories && memoryStore.length ? [memoryStore[0]] : []),
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: Omit<MemoryRow, 'id'> | { clerkUserId: string }) => {
      if (table === users) {
        return {
          onConflictDoNothing: () => ({
            returning: () => {
              const maybeUser = values as { clerkUserId: string };
              const existing = userStore.find((row) => row.clerkUserId === maybeUser.clerkUserId);
              if (existing) return [];
              const record = {
                id: `usr_${userStore.length + 1}`,
                clerkUserId: maybeUser.clerkUserId,
              };
              userStore.push(record);
              return [record];
            },
          }),
        };
      }

      const memoryValues = values as Omit<MemoryRow, 'id'>;
      const buildRecord = () => ({
        id: `mem_${memoryStore.length + 1}`,
        ...memoryValues,
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
              (row) => row.authorId === memoryValues.authorId && row.idempotencyKey === memoryValues.idempotencyKey
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
  authMiddleware: (
    req: MockAuthRequest,
    res: MockAuthResponse,
    next: () => void,
  ) => {
    if (!req.headers.authorization) {
      return res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      });
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
    userStore.length = 0;
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/memories')
      .send({ content: 'hola' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      },
    });
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

  it('upserts user before creating memory', async () => {
    const res = await request(app)
      .post('/api/memories')
      .set('Authorization', 'Bearer test')
      .send({ content: 'Memoria con upsert de user.' });

    expect(res.status).toBe(201);
    expect(userStore).toHaveLength(1);
    expect(userStore[0].clerkUserId).toBe('user_test_123');
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
