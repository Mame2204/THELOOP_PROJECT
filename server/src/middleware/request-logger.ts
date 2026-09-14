import type { NextFunction, Request, Response } from 'express';

/** Journalisation légère des requêtes API (ops prod). */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  const path = req.originalUrl || req.url;
  res.on('finish', () => {
    const ms = Date.now() - started;
    const line = `[http] ${req.method} ${path} → ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) {
      console.error(line);
    } else if (res.statusCode >= 400) {
      console.warn(line);
    } else if (path.startsWith('/api/') || path === '/health') {
      console.log(line);
    }
  });
  next();
}
