/**
 * Redirige vers l’API Render (page auth-callback à jour).
 * Les anciens e-mails / site_url Supabase pointaient encore ici → écran « Chargement… » bloqué.
 *
 * Déploiement : supabase functions deploy auth-callback
 */
const API_CALLBACK = 'https://api.theloop-app.com/auth/callback';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const incoming = new URL(req.url);
  const target = new URL(API_CALLBACK);
  incoming.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  if (incoming.hash) {
    target.hash = incoming.hash;
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: target.toString(),
      'Cache-Control': 'no-store',
    },
  });
});
