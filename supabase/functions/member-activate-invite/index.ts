/**
 * Finalise l'activation d'un compte invité par THE LOOP (sans repasser par le lien e-mail).
 *
 * Déploiement :
 *   supabase functions deploy member-activate-invite
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  action?: 'send_code';
  emailCode?: string | null;
  email?: string;
  password?: string;
  inviteId?: string;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  city?: string | null;
  countryCode?: string | null;
  phoneNumber?: string | null;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Chiffres uniquement (Supabase peut émettre 6 ou 8 selon mailer_otp_length). */
function normalizeOtpDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Preuve de possession de la boîte mail : code numérique {{ .Token }} de l'e-mail
 * « Nouveau mot de passe » (send_code → resetPasswordForEmail). Ce n'est pas le mot de passe.
 */
async function verifyEmailCode(
  supabaseUrl: string,
  keys: string[],
  email: string,
  rawCode: string,
): Promise<{ ok: boolean; lastError?: string }> {
  const code = normalizeOtpDigits(rawCode);
  if (!/^\d{4,10}$/.test(code)) {
    return { ok: false, lastError: 'format' };
  }

  const types = ['recovery', 'invite', 'email'] as const;
  let lastError: string | undefined;

  for (const apiKey of keys) {
    if (!apiKey.trim()) continue;
    const client = createClient(supabaseUrl, apiKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const type of types) {
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type });
      if (!error && data?.user && (data.user.email ?? '').toLowerCase() === email) {
        return { ok: true };
      }
      if (error?.message) lastError = error.message;
    }
  }

  return { ok: false, lastError };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    // Code e-mail obligatoire par défaut (secret `false` uniquement pour rollback temporaire).
    const requireEmailCode =
      (Deno.env.get('INVITE_REQUIRE_EMAIL_CODE') ?? 'true').trim().toLowerCase() !== 'false';

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Configuration serveur incomplète' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const email = normalizeEmail(body.email ?? '');
    const password = (body.password ?? '').trim();
    const inviteId = (body.inviteId ?? '').trim();
    const emailCode = (body.emailCode ?? '').replace(/\s/g, '');

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'E-mail invalide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'send_code') {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: pending } = await admin.rpc('find_pending_admin_invite_by_email', { p_email: email });
      // Réponse identique qu'il y ait une invitation ou non.
      if (pending && typeof pending === 'object') {
        const { error: sendErr } = await admin.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://api.theloop-app.com/auth/callback',
        });
        if (sendErr) {
          const lower = (sendErr.message ?? '').toLowerCase();
          if (sendErr.status === 429 || lower.includes('rate limit') || lower.includes('security purposes')) {
            return json(
              { error: 'rate_limited', message: 'Un code vient d\'être envoyé. Patientez une minute avant de redemander.' },
              429,
            );
          }
          console.warn('[member-activate-invite] send_code:', sendErr.message);
        }
      }
      return json({ ok: true });
    }

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return new Response(
        JSON.stringify({
          error: 'Mot de passe : minimum 8 caractères, avec au moins une lettre et un chiffre.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: inviteJson, error: inviteErr } = await admin.rpc('find_pending_admin_invite_by_email', {
      p_email: email,
    });
    if (inviteErr) {
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!inviteJson || typeof inviteJson !== 'object') {
      return new Response(JSON.stringify({ error: 'Aucune invitation en attente pour cet e-mail.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const invite = inviteJson as {
      id?: string;
      email?: string;
      user_role?: string;
      first_name?: string | null;
      last_name?: string | null;
      city?: string | null;
      country_code?: string | null;
    };

    function defaultInviteFirstName(userRole?: string | null): string {
      const role = (userRole ?? 'member').toLowerCase();
      if (role === 'partner') return 'Partenaire';
      if (role === 'admin') return 'Administrateur';
      return 'Membre';
    }
    // L’app peut envoyer un ancien inviteId (cache local) après suppression / ré-invite admin.
    // La source de vérité est l’invitation en attente retournée par le RPC pour cet e-mail.
    if (inviteId && invite.id && invite.id !== inviteId) {
      console.warn(
        '[member-activate-invite] inviteId obsolète ignoré',
        JSON.stringify({ clientInviteId: inviteId, serverInviteId: invite.id, email }),
      );
    }

    const inviteRole = String(invite.user_role ?? '').trim().toLowerCase();
    const authKeys = [anonKey, serviceKey].filter((k, i, arr) => k.trim() && arr.indexOf(k) === i);

    let emailProven = false;
    if (emailCode) {
      const verified = await verifyEmailCode(supabaseUrl, authKeys, email, emailCode);
      emailProven = verified.ok;
      if (!emailProven) {
        return json(
          {
            error: 'invalid_email_code',
            message:
              'Code invalide ou expiré. Ouvrez le dernier e-mail « Code de vérification — THE LOOP », saisissez les 6 chiffres dans l’app, ou touchez « Renvoyer le code ».',
          },
          400,
        );
      }
    }

    // Sans code valide, activer = n’importe qui pourrait fixer le MDP d’un invité.
    if (!emailProven && requireEmailCode) {
      return json(
        {
          error:
            'Code requis : touchez « Envoyer le code » dans l’app, puis saisissez les 6 chiffres reçus par e-mail (objet « Code de vérification — THE LOOP »).',
          code: 'email_code_required',
        },
        403,
      );
    }

    const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authUser = listed.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (!authUser) {
      return new Response(
        JSON.stringify({ error: 'no_auth_user', message: 'Compte Auth introuvable — utilisez l\'inscription classique.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: profile } = await admin
      .from('users')
      .select('account_status')
      .ilike('email', email)
      .maybeSingle();

    const accountStatus = String(profile?.account_status ?? '').trim().toLowerCase();
    if (accountStatus && accountStatus !== 'invited') {
      if (invite.id) {
        await admin.rpc('mark_admin_user_invite_activated', {
          p_invite_id: invite.id,
          p_email: email,
        });
      }
      return new Response(
        JSON.stringify({
          error: 'account_already_active',
          message:
            'Ce compte est déjà actif. Connectez-vous avec votre mot de passe ou utilisez « Mot de passe oublié ».',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Priorité identité : saisie à l'activation > invite admin > placeholders rôle.
    const bodyFirst = (body.firstName ?? '').trim();
    const bodyLast = (body.lastName ?? '').trim();
    const inviteFirst = (invite.first_name ?? '').trim();
    const inviteLast = (invite.last_name ?? '').trim();
    const profileFirst =
      bodyFirst || inviteFirst || defaultInviteFirstName(invite.user_role);
    const profileLast = bodyLast || inviteLast || 'THE LOOP';
    const birthDate = (body.birthDate ?? '').trim() || null;
    const city = (body.city ?? invite.city ?? '').trim() || null;
    const countryCode = (body.countryCode ?? invite.country_code ?? 'GN').trim().toUpperCase().slice(0, 2);
    const phoneNumber = (body.phoneNumber ?? '').trim() || null;

    const { error: profileErr } = await admin
      .from('users')
      .update({
        first_name: profileFirst,
        last_name: profileLast,
        birth_date: birthDate,
        city,
        country_code: countryCode,
        phone_number: phoneNumber,
        user_role: invite.user_role ?? undefined,
        is_active: true,
        account_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .ilike('email', email);
    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...authUser.user_metadata,
        pending_welcome: true,
        invited_by_admin: true,
        admin_invite_id: invite.id ?? null,
        first_name: profileFirst,
        last_name: profileLast,
        user_role: invite.user_role ?? authUser.user_metadata?.user_role ?? 'member',
      },
    });
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (invite.id) {
      await admin.rpc('mark_admin_user_invite_activated', {
        p_invite_id: invite.id,
        p_email: email,
      });
    }

    // Anciennes notifs cloche (admin-web les créait à l’envoi d’invite — inutiles une fois le compte actif).
    await admin
      .from('user_notifications')
      .delete()
      .eq('user_id', authUser.id)
      .or(
        'title.eq.Invitation THE LOOP,message.ilike.%Activer un compte invité par THE LOOP%',
      );

    return new Response(JSON.stringify({ ok: true, userId: authUser.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
