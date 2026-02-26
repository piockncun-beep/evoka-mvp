import express from 'express';
import type { Request } from 'express';
import cors from 'cors';
import z from 'zod';
import { authMiddleware } from './auth.js';
import { db } from './db.js';
import { users } from '../db/schema/00_core.js';
import memoriesRouter from './memories.js';

declare module 'express' {
  interface Request {
    auth?: { userId: string };
  }
}

const app = express();
const PORT = 8787;

// CORS
const allowedOrigins = ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.app.github.dev')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Logging in dev
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});


app.get('/api/me', authMiddleware, (req: Request, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ userId });
});

app.post('/api/me/sync', authMiddleware, async (req: Request, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const bodySchema = z.object({
    email: z.string().email().optional(),
  });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: 'Invalid body' });
  }
  await db.insert(users).values({
    clerkUserId: userId,
    email: body.data.email,
  }).onConflictDoUpdate({
    target: users.clerkUserId,
    set: {
      email: body.data.email,
    },
  });
  res.json({ ok: true });
});

app.use('/api/memories', memoriesRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});