type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  priority: 'high';
  ttl?: number;
  data?: Record<string, string>;
};

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

/** Envoi Expo Push minimal (cron serveur — pas de JWT utilisateur requis). */
export async function sendExpoPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return { sent: 0, failed: 0 };

  const messages: ExpoMessage[] = unique.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    channelId: 'theloop-default',
    priority: 'high',
    ttl: 60 * 60 * 24,
    data: { ...(data ?? {}), source: 'theloop-cron' },
  }));

  let sent = 0;
  let failed = 0;

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
      failed += chunk.length;
      continue;
    }

    const json = (await res.json()) as { data?: ExpoTicket[] };
    for (const ticket of json.data ?? []) {
      if (ticket.status === 'ok') sent += 1;
      else failed += 1;
    }
  }

  return { sent, failed };
}

export async function sendExpoPushToUserIds(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; failed: number; reason?: string }> {
  const ids = [...new Set(userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return { sent: 0, failed: 0, reason: 'no_users' };

  const { data: rows, error } = await supabase
    .from('user_push_tokens')
    .select('expo_push_token')
    .in('user_id', ids);

  if (error) return { sent: 0, failed: 0, reason: error.message };

  const tokens = [...new Set((rows ?? []).map((r) => String(r.expo_push_token)).filter(Boolean))];
  if (!tokens.length) return { sent: 0, failed: 0, reason: 'no_tokens' };

  const result = await sendExpoPushToTokens(tokens, title, body, data);
  return result;
}
