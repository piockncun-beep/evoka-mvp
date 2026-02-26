import { verifyToken } from '@clerk/backend';
import type { Request, Response, NextFunction } from 'express';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';

export async function requireUserId(req: any): Promise<string> {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    const err: any = new Error('Missing Authorization header');
    err.status = 401;
    throw err;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    if (!payload.sub) {
      const err: any = new Error('Invalid token payload');
      err.status = 401;
      throw err;
    }
    return payload.sub;
  } catch (e) {
    const err: any = new Error('Invalid or expired token');
    err.status = 401;
    throw err;
  }
}

declare module 'express' {
  interface Request {
    auth?: { userId: string };
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  const token = authHeader.substring(7);
  try {
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });
    req.auth = { userId: payload.sub };
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'UNAUTHORIZED' });
  }
};

export function isUnauthorized(err: any) {
  return err && err.status === 401;
}