import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  if (!config.cronSecret) {
    res.status(503).json({ error: 'Cron non configuré (CRON_SECRET manquant).' });
    return;
  }

  const headerSecret =
    req.get('x-cron-secret')?.trim()
    || req.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    || '';

  if (!headerSecret || !secretsMatch(headerSecret, config.cronSecret)) {
    res.status(401).json({ error: 'Non autorisé.' });
    return;
  }

  next();
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
