/**
 * Envoie des notifications système via Expo Push API.
 * Appelée après écriture inbox (append / distribute) pour alertes hors premier plan.
 *
 * Déploiement :
 *   supabase functions deploy send-push
 *
 * Secrets (déjà fournis par Supabase) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushBody = {
  userIds?: string[];
  title?: string;
  body?: string;
  data?: Record<string, string>;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  priority: 'high';
  /** Garde le message livrable même si l’appareil est en veille. */
  ttl?: number;
  data?: Record<string, string>;
};

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

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

    // Vérifie qu’un utilisateur (ou service) est authentifié.
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

    const payload = (await req.json()) as PushBody;
    const userIds = [...new Set((payload.userIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
    const title = (payload.title ?? '').trim();
    const body = (payload.body ?? '').trim();

    if (!userIds.length || !title || !body) {
      return new Response(JSON.stringify({ error: 'userIds, title et body requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: rows, error: tokenErr } = await admin
      .from('user_push_tokens')
      .select('expo_push_token, user_id')
      .in('user_id', userIds);

    if (tokenErr) {
      return new Response(JSON.stringify({ error: tokenErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokens = [...new Set((rows ?? []).map((r) => String(r.expo_push_token)).filter(Boolean))];
    if (!tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no_tokens' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messages: ExpoMessage[] = tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'theloop-default',
      priority: 'high',
      ttl: 60 * 60 * 24,
      data: {
        ...(payload.data ?? {}),
        source: 'theloop',
      },
    }));

    let sent = 0;
    let failed = 0;
    const ticketErrors: Array<{ error: string; message: string }> = [];
    const ticketIds: string[] = [];
    const tokenByTicketId = new Map<string, string>();

    // Expo Push API : lots de 100 max.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('[send-push] Expo API', res.status, text);
        failed += chunk.length;
        ticketErrors.push({ error: 'HttpError', message: text.slice(0, 300) });
        continue;
      }

      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      for (let t = 0; t < tickets.length; t++) {
        const ticket = tickets[t];
        const pushToken = chunk[t]?.to;
        if (ticket.status === 'ok' && ticket.id) {
          sent += 1;
          ticketIds.push(ticket.id);
          if (pushToken) tokenByTicketId.set(ticket.id, pushToken);
          continue;
        }
        failed += 1;
        const errCode = ticket.status === 'error' ? (ticket.details?.error ?? 'Unknown') : 'Unknown';
        const errMsg =
          ticket.status === 'error' ? (ticket.message ?? 'Push ticket error') : 'Push ticket error';
        ticketErrors.push({ error: errCode, message: errMsg });
        console.error('[send-push] ticket', errCode, errMsg);
        // Token mort dès le ticket → purge immédiate.
        if (errCode === 'DeviceNotRegistered' && pushToken) {
          await admin.from('user_push_tokens').delete().eq('expo_push_token', pushToken);
        }
      }
    }

    // Les erreurs FCM arrivent souvent au receipt (ticket OK puis DeviceNotRegistered).
    const receiptErrors: Array<{ error: string; message: string }> = [];
    let delivered = 0;
    if (ticketIds.length) {
      await sleep(2500);
      for (let i = 0; i < ticketIds.length; i += 100) {
        const ids = ticketIds.slice(i, i + 100);
        const receiptRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        });
        if (!receiptRes.ok) {
          console.error('[send-push] receipts HTTP', receiptRes.status, await receiptRes.text());
          continue;
        }
        const receiptJson = (await receiptRes.json()) as {
          data?: Record<
            string,
            | { status: 'ok' }
            | { status: 'error'; message?: string; details?: { error?: string } }
          >;
        };
        for (const [id, receipt] of Object.entries(receiptJson.data ?? {})) {
          if (receipt.status === 'ok') {
            delivered += 1;
            continue;
          }
          const errCode = receipt.details?.error ?? 'Unknown';
          const errMsg = receipt.message ?? 'Push receipt error';
          receiptErrors.push({ error: errCode, message: errMsg });
          console.error('[send-push] receipt', errCode, errMsg);
          const deadToken = tokenByTicketId.get(id);
          if (errCode === 'DeviceNotRegistered' && deadToken) {
            await admin.from('user_push_tokens').delete().eq('expo_push_token', deadToken);
            console.log('[send-push] token purgé DeviceNotRegistered');
          }
        }
      }
    }

    const allErrors = [...ticketErrors, ...receiptErrors].slice(0, 8);
    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        failed,
        delivered,
        recipients: userIds.length,
        tokens: tokens.length,
        errors: allErrors,
        hint:
          allErrors.some((e) => e.error === 'DeviceNotRegistered')
            ? 'Token mort : rouvrir THE LOOP sur le téléphone (connecté, notifs autorisées) pour régénérer un ExponentPushToken, puis retester.'
            : allErrors.some((e) => e.error === 'InvalidCredentials')
              ? 'FCM V1 / APNs : vérifier Credentials Expo pour gn.theloop.app.'
              : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-push]', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
