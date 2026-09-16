import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import {
  notifyMemberBenefitCancelled,
  notifyMemberBenefitValidated,
  pushMemberBenefitCancelled,
  pushMemberBenefitValidated,
} from '../services/partner-benefit-notify.js';

export const partnerValidationRouter = Router();

type PartnerCodeRow = {
  partner_key: string;
  partner_name: string;
  validation_code: string;
};

type RedemptionRow = {
  local_id: string;
  benefit_id: string;
  user_id: string;
  partner_key: string;
  partner_name: string;
  partner_code: string;
  status: string;
  expires_at: string;
};

function normalizePartnerCode(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s/g, '');
  if (t.startsWith('CODE-')) return t;
  if (t.startsWith('CODE')) return `CODE-${t.slice(4)}`;
  return `CODE-${t}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function loadPartnerCode(code: string): Promise<PartnerCodeRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('partner_validation_codes')
    .select('partner_key, partner_name, validation_code')
    .eq('validation_code', code)
    .maybeSingle();
  if (error || !data) return null;
  return data as PartnerCodeRow;
}

function redemptionMatchesPartner(redemption: RedemptionRow, partner: PartnerCodeRow, code: string): boolean {
  if (redemption.partner_code === code) return true;
  if (redemption.partner_key === partner.partner_key) return true;
  return redemption.partner_name.trim().toLowerCase() === partner.partner_name.trim().toLowerCase();
}

/**
 * POST /api/partner/pending-validations
 * Body: { memberUserId, partnerCode }
 * Lecture service role — remplace la RPC si migration SQL impossible (42501).
 */
partnerValidationRouter.post('/partner/pending-validations', async (req, res) => {
  try {
    const memberUserId = String(req.body?.memberUserId ?? '').trim();
    const partnerCode = normalizePartnerCode(String(req.body?.partnerCode ?? ''));

    if (!isUuid(memberUserId) || !/^CODE-[A-Z0-9]{5}$/.test(partnerCode)) {
      res.status(400).json({ error: 'invalid_params' });
      return;
    }

    const partner = await loadPartnerCode(partnerCode);
    if (!partner) {
      res.status(404).json({ error: 'invalid_partner_code' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: redemptions, error } = await supabase
      .from('benefit_redemptions')
      .select('local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, expires_at')
      .eq('user_id', memberUserId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(15);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const items: Record<string, unknown>[] = [];

    for (const row of (redemptions ?? []) as RedemptionRow[]) {
      if (!redemptionMatchesPartner(row, partner, partnerCode)) continue;

      const { data: grant, error: grantError } = await supabase
        .from('prime_benefit_grants')
        .select('local_id, title, description, status')
        .eq('local_id', row.benefit_id)
        .eq('user_id', memberUserId)
        .maybeSingle();

      if (grantError || !grant || grant.status !== 'pending_validation') continue;

      items.push({
        redemptionLocalId: row.local_id,
        benefitId: row.benefit_id,
        benefitTitle: grant.title,
        benefitDescription: grant.description ?? '',
        partnerKey: row.partner_key,
        partnerName: row.partner_name,
        partnerCode: row.partner_code,
        expiresAt: row.expires_at,
      });
    }

    res.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'server_error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/partner/apply-validation
 * Body: { partnerCode, redemptionLocalIds: string[], validate?: boolean }
 */
partnerValidationRouter.post('/partner/apply-validation', async (req, res) => {
  try {
    const partnerCode = normalizePartnerCode(String(req.body?.partnerCode ?? ''));
    const redemptionLocalIds = Array.isArray(req.body?.redemptionLocalIds)
      ? req.body.redemptionLocalIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];
    const validate = req.body?.validate !== false;

    if (!/^CODE-[A-Z0-9]{5}$/.test(partnerCode) || !redemptionLocalIds.length) {
      res.status(400).json({ error: 'invalid_params' });
      return;
    }

    const partner = await loadPartnerCode(partnerCode);
    if (!partner) {
      res.status(404).json({ error: 'invalid_partner_code' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: redemptions, error } = await supabase
      .from('benefit_redemptions')
      .select('local_id, benefit_id, user_id, partner_key, partner_name, partner_code, status, expires_at')
      .in('local_id', redemptionLocalIds)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(Math.max(15, redemptionLocalIds.length));

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    let applied = 0;
    const now = new Date().toISOString();
    const notifyTasks: Array<Promise<void>> = [];

    for (const row of (redemptions ?? []) as RedemptionRow[]) {
      if (!redemptionMatchesPartner(row, partner, partnerCode)) continue;

      const { data: grant } = await supabase
        .from('prime_benefit_grants')
        .select('title')
        .eq('local_id', row.benefit_id)
        .eq('user_id', row.user_id)
        .maybeSingle();

      const { data: redemptionMeta } = await supabase
        .from('benefit_redemptions')
        .select('content_title')
        .eq('local_id', row.local_id)
        .maybeSingle();

      const benefitTitle = String(grant?.title ?? 'Privilège').trim() || 'Privilège';
      const placeLabel =
        String(redemptionMeta?.content_title ?? row.partner_name ?? partner.partner_name).trim()
        || 'le partenaire';

      if (validate) {
        const { error: redError } = await supabase
          .from('benefit_redemptions')
          .update({ status: 'validated', validated_at: now })
          .eq('local_id', row.local_id);

        const { error: grantError } = await supabase
          .from('prime_benefit_grants')
          .update({ status: 'used', used_at: now })
          .eq('local_id', row.benefit_id)
          .eq('user_id', row.user_id)
          .eq('status', 'pending_validation');

        if (!redError && !grantError) {
          applied += 1;
          notifyTasks.push(
            notifyMemberBenefitValidated(row.user_id, benefitTitle, placeLabel).catch(() => undefined),
          );
        }
      } else {
        const { error: redError } = await supabase
          .from('benefit_redemptions')
          .update({ status: 'cancelled' })
          .eq('local_id', row.local_id);

        const { error: grantError } = await supabase
          .from('prime_benefit_grants')
          .update({ status: 'active' })
          .eq('local_id', row.benefit_id)
          .eq('user_id', row.user_id)
          .eq('status', 'pending_validation');

        if (!redError && !grantError) {
          applied += 1;
          notifyTasks.push(
            notifyMemberBenefitCancelled(row.user_id, benefitTitle, placeLabel).catch(() => undefined),
          );
        }
      }
    }

    if (notifyTasks.length) {
      await Promise.all(notifyTasks);
    }

    res.json({ applied });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'server_error';
    res.status(500).json({ error: message });
  }
});

type BenefitNotifyItem = {
  redemptionLocalId: string;
  action: 'validated' | 'cancelled';
};

/**
 * POST /api/partner/benefit-notify
 * Push OS membre après validation RPC (inbox déjà écrite côté Supabase).
 * Body: { partnerCode, items: [{ redemptionLocalId, action }] }
 */
partnerValidationRouter.post('/partner/benefit-notify', async (req, res) => {
  try {
    const partnerCode = normalizePartnerCode(String(req.body?.partnerCode ?? ''));
    const items = Array.isArray(req.body?.items)
      ? (req.body.items as BenefitNotifyItem[])
      : [];

    if (!/^CODE-[A-Z0-9]{5}$/.test(partnerCode) || !items.length) {
      res.status(400).json({ error: 'invalid_params' });
      return;
    }

    const partner = await loadPartnerCode(partnerCode);
    if (!partner) {
      res.status(404).json({ error: 'invalid_partner_code' });
      return;
    }

    const supabase = getSupabaseAdmin();
    let pushed = 0;

    for (const item of items) {
      const redemptionLocalId = String(item?.redemptionLocalId ?? '').trim();
      const action = item?.action === 'cancelled' ? 'cancelled' : 'validated';
      if (!redemptionLocalId) continue;

      const expectedStatus = action === 'validated' ? 'validated' : 'cancelled';
      const { data: row } = await supabase
        .from('benefit_redemptions')
        .select('local_id, benefit_id, user_id, partner_name, content_title, status')
        .eq('local_id', redemptionLocalId)
        .eq('status', expectedStatus)
        .maybeSingle();

      if (!row) continue;

      const { data: grant } = await supabase
        .from('prime_benefit_grants')
        .select('title')
        .eq('local_id', row.benefit_id)
        .eq('user_id', row.user_id)
        .maybeSingle();

      const benefitTitle = String(grant?.title ?? 'Privilège').trim() || 'Privilège';
      const placeLabel =
        String(row.content_title ?? row.partner_name ?? partner.partner_name).trim() || 'le partenaire';

      if (action === 'validated') {
        await pushMemberBenefitValidated(String(row.user_id), benefitTitle, placeLabel);
      } else {
        await pushMemberBenefitCancelled(String(row.user_id), benefitTitle, placeLabel);
      }
      pushed += 1;
    }

    res.json({ pushed });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'server_error';
    res.status(500).json({ error: message });
  }
});
