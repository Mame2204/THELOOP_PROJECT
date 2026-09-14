import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

/** Vérifie que l'utilisateur authentifié est admin ou super_admin actif. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.authUser?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('user_role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (
    error ||
    !data?.is_active ||
    (data.user_role !== 'admin' && data.user_role !== 'super_admin')
  ) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  next();
}
