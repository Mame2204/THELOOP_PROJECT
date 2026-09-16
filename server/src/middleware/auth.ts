import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

/**
 * Vérifie le JWT utilisateur Supabase (Authorization: Bearer …).
 * Utilise la clé publishable/anon + endpoint Auth (compatible clés sb_publishable_* et JWT asymétriques).
 */
export async function requireSupabaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Token manquant.' });
    return;
  }

  const apiKey = config.supabaseAnonKey || config.supabaseServiceRoleKey;
  let authResponse: globalThis.Response;
  try {
    authResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    res.status(503).json({ error: 'Auth Supabase injoignable.' });
    return;
  }

  if (!authResponse.ok) {
    res.status(401).json({ error: 'Session invalide ou expirée.' });
    return;
  }

  const body = (await authResponse.json()) as { id?: string; email?: string | null };
  if (!body.id) {
    res.status(401).json({ error: 'Session invalide ou expirée.' });
    return;
  }

  req.authUser = { id: body.id, email: body.email ?? undefined };
  next();
}
