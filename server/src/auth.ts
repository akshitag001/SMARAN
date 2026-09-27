import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import type { Role, User } from '@smaran/shared';
import type { Repo } from './repo';

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (data: string) => createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

/** A small signed session token: base64url(payload).signature */
export function issueToken(mentorId: string): string {
  const payload = b64(JSON.stringify({ sub: mentorId, exp: Date.now() + config.sessionDays * 864e5 }));
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; exp: number };
    return exp > Date.now() ? sub : null;
  } catch {
    return null;
  }
}

/** Rejects requests without a valid session; puts the signed-in person on res.locals.user. */
export function requireUser(repo: Repo) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const id = header.startsWith('Bearer ') ? readToken(header.slice(7)) : null;
    const user = id ? repo.user(id) : null;
    if (!user || !user.active) {
      res.status(401).json({ error: 'Your session has ended. Sign in again.' });
      return;
    }
    res.locals.user = user;
    next();
  };
}

/** Allows only the given roles through. */
export function allow(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as User;
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Your role doesn’t have access to this.' });
      return;
    }
    next();
  };
}
