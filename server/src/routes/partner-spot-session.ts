import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { bruteForceLimiter } from '../middleware/rate-limit.js';

export const partnerSpotSessionRouter = Router();

// Route volontairement anonyme : sa seule protection est le secret du jeton SPOT.
partnerSpotSessionRouter.use('/partner/spot-session', bruteForceLimiter);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * POST /api/partner/spot-session
 * Body: { tokenCode }
 * Échange un jeton SPOT actif contre une session Supabase (service role).
 */
partnerSpotSessionRouter.post('/partner/spot-session', async (req, res) => {
  try {
    const tokenCode = String(req.body?.tokenCode ?? '').trim().toUpperCase();
    if (!tokenCode) {
      res.status(400).json({ error: 'invalid_params' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: tokenRow, error: tokenError } = await supabase
      .from('partner_tokens')
      .select('user_id, status, expires_at')
      .eq('token_code', tokenCode)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (tokenError || !tokenRow?.user_id || !isUuid(String(tokenRow.user_id))) {
      res.status(404).json({ error: 'invalid_token' });
      return;
    }

    const partnerUserId = String(tokenRow.user_id);
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', partnerUserId)
      .maybeSingle();

    const email = userRow?.email ? String(userRow.email).trim() : '';
    if (!email) {
      res.status(404).json({ error: 'partner_email_missing' });
      return;
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      res.status(500).json({ error: linkError?.message ?? 'link_failed' });
      return;
    }

    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: String(hashedToken),
      type: 'email',
    });

    if (verifyError || !verified.session) {
      res.status(500).json({ error: verifyError?.message ?? 'verify_failed' });
      return;
    }

    res.json({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
      partnerUserId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'server_error';
    res.status(500).json({ error: message });
  }
});
