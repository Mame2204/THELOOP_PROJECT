import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const PARTNER_ROLES = new Set(['partner']);

declare global {
  namespace Express {
    interface Request {
      authRole?: string;
    }
  }
}

export function isAdminRole(role: string | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.has(role));
}

/** Vérifie que l'utilisateur authentifié est un partenaire actif, ou un admin agissant pour lui. */
export async function requirePartner(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  const role = String(data?.user_role ?? '');
  if (error || !data?.is_active || (!PARTNER_ROLES.has(role) && !ADMIN_ROLES.has(role))) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  req.authRole = role;
  next();
}

/**
 * Un partenaire ne pilote que son propre compte ; l'admin peut agir sur n'importe lequel.
 * Sans ce contrôle, `partnerUserId` venant du corps de requête serait une identité déclarative.
 */
export function ownsPartnerAccount(req: Request, partnerUserId: string): boolean {
  if (isAdminRole(req.authRole)) return true;
  return req.authUser?.id === partnerUserId;
}
