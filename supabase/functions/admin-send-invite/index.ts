/**
 * Envoie une invitation Auth Supabase (e-mail) pour un compte pré-créé par l'admin.
 *
 * Déploiement :
 *   supabase functions deploy admin-send-invite
 *   supabase functions deploy auth-callback
 *
 * Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type InviteBody = {
  email?: string;
  inviteId?: string;
  redirectTo?: string;
  firstName?: string | null;
  lastName?: string | null;
  userRole?: string;
  countryCode?: string;
  phoneNumber?: string | null;
  city?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await adminClient
      .from('users')
      .select('user_role, is_active')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (!profile?.is_active) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const role = String(profile.user_role ?? '');
    if (role !== 'admin' && role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Admin requis' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json().catch(() => ({}))) as InviteBody;
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'E-mail invalide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const redirectTo =
      (body.redirectTo ?? '').trim() ||
      Deno.env.get('AUTH_REDIRECT_URL') ||
      `${supabaseUrl.replace(/\/$/, '')}/functions/v1/auth-callback`;

    const metadata: Record<string, unknown> = {
      pending_welcome: true,
      invited_by_admin: true,
      admin_invite_id: body.inviteId ?? null,
      first_name: body.firstName ?? null,
      last_name: body.lastName ?? null,
      user_role: body.userRole ?? 'member',
      country_code: body.countryCode ?? 'GN',
      phone_number: body.phoneNumber ?? null,
      city: body.city ?? null,
    };

    const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: metadata,
    });

    if (inviteErr) {
      const msg = inviteErr.message?.toLowerCase() ?? '';
      const already =
        msg.includes('already') || msg.includes('registered') || msg.includes('exists');
      if (!already) {
        return new Response(JSON.stringify({ error: inviteErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Compte déjà présent : renvoyer un e-mail de réinitialisation (même UX set_password)
      const recoverRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, redirect_to: redirectTo }),
      });
      if (!recoverRes.ok) {
        const recoverBody = await recoverRes.text();
        return new Response(
          JSON.stringify({
            error: `Compte déjà présent. Renvoi impossible : ${recoverBody.slice(0, 200)}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
      if (body.inviteId) {
        await adminClient
          .from('admin_user_invites')
          .update({ otp_sent_at: new Date().toISOString() })
          .eq('id', body.inviteId);
      }
      return new Response(JSON.stringify({ ok: true, mode: 'recovery_resent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.inviteId) {
      await adminClient
        .from('admin_user_invites')
        .update({ otp_sent_at: new Date().toISOString() })
        .eq('id', body.inviteId);
    }

    return new Response(
      JSON.stringify({ ok: true, mode: 'invite', userId: invited.user?.id ?? null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erreur serveur' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
