import { supabase } from './supabase';
import { addPartnershipNote } from './partnerships';

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePartnerTokenCode(): string {
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)];
  }
  return `SPOT-${code}-${new Date().getFullYear()}`;
}

export async function onboardApprovedPartnership(input: {
  partnershipId: string;
  establishmentName: string;
  managerName: string;
  email: string;
  countryCode: string;
}): Promise<{ ok: boolean; tokenCode?: string; error?: string }> {
  const partnerName = input.establishmentName.trim() || input.managerName.trim() || 'Partenaire';
  const email = input.email.trim().toLowerCase();
  const expiresAt = new Date(new Date().getFullYear() + 1, 11, 31, 23, 59, 59).toISOString();

  let userId: string | null = null;
  if (email) {
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    userId = userRow?.id ? String(userRow.id) : null;
  }

  let tokenCode = generatePartnerTokenCode();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.from('partner_tokens').insert({
      partner_name: partnerName,
      token_code: tokenCode,
      expires_at: expiresAt,
      status: 'active',
      user_id: userId,
    });
    if (!error) break;
    if (error.code === '23505') {
      tokenCode = generatePartnerTokenCode();
      continue;
    }
    return { ok: false, error: error.message };
  }

  await addPartnershipNote(
    input.partnershipId,
    `Jeton SPOT généré : ${tokenCode}. À transmettre au partenaire pour la connexion Espace Pro.`,
    null,
    'Système THE LOOP',
  );

  if (userId) {
    await supabase.from('user_notifications').insert({
      user_id: userId,
      title: 'Partenariat validé — accès SPOT',
      message: `Bienvenue chez THE LOOP. Votre code Espace Pro : ${tokenCode}. Connectez-vous via « Partenaires » dans l'application.`,
      audience: 'partner',
      sent_at: new Date().toISOString(),
    });
  }

  return { ok: true, tokenCode };
}
