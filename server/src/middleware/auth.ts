import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
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
 * Vérifie le JWT Supabase envoyé par l'app mobile (Authorization: Bearer …).
 * Aucune clé secrète Djomy côté client — seulement ce token utilisateur.
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

  const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Session invalide ou expirée.' });
    return;
  }

  req.authUser = { id: data.user.id, email: data.user.email ?? undefined };
  next();
}
