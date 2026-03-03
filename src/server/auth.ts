import { verifyToken } from '@clerk/backend';
import type { Request, Response, NextFunction } from 'express';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';

type StatusError = Error & { status: number };

function unauthorizedError(message: string): StatusError {
  const err = new Error(message) as StatusError;
  err.status = 401;
  return err;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorLog(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'UnknownError', message: 'Unknown error' };
}

function parseDebugClaim(payload: unknown, key: 'iss' | 'aud' | 'sub') {
  if (!isRecord(payload)) return undefined;
  return payload[key];
}

export async function requireUserId(req: Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw unauthorizedError('Missing Authorization header');
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw unauthorizedError('Invalid token payload');
    }
    return payload.sub;
  } catch {
    throw unauthorizedError('Invalid or expired token');
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
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
    });
  }
  if (!CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'MISSING_CLERK_SECRET_KEY' });
  }
  const token = authHeader.substring(7);
  try {
    if (process.env.NODE_ENV !== 'production') {
      try {
        const payloadRaw = token.split('.')[1];
        if (payloadRaw) {
          const payload: unknown = JSON.parse(
            Buffer.from(payloadRaw, 'base64').toString(),
          );
          console.log('Auth debug payload', {
            iss: parseDebugClaim(payload, 'iss'),
            aud: parseDebugClaim(payload, 'aud'),
            sub: parseDebugClaim(payload, 'sub'),
          });
        }
      } catch (decodeError: unknown) {
        const info = getErrorLog(decodeError);
        console.warn('Auth debug payload decode failed', {
          name: info.name,
          message: info.message,
        });
      }
    }
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });
    req.auth = { userId: payload.sub };
    next();
  } catch (error: unknown) {
    const info = getErrorLog(error);
    console.error('Auth error:', { name: info.name, message: info.message });
    res.status(401).json({
      ok: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
    });
  }
};

export function isUnauthorized(err: unknown) {
  if (!isRecord(err)) return false;
  return err.status === 401;
}