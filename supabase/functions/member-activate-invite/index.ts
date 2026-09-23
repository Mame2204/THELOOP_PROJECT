/**
 * Finalise l'activation d'un compte invité par l'équipe (sans repasser par le lien e-mail).
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
  email?: string;
  password?: string;
  inviteId?: string;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'E-mail invalide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Mot de passe trop court (8 caractères minimum).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const invite = inviteJson as { id?: string; email?: string };
    if (inviteId && invite.id && invite.id !== inviteId) {
      return new Response(JSON.stringify({ error: 'Invitation invalide pour cet e-mail.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...authUser.user_metadata,
        pending_welcome: true,
        invited_by_admin: true,
        admin_invite_id: invite.id ?? null,
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
