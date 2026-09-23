/**
 * Recopie server/static/auth-callback.html dans supabase/functions/auth-callback/index.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, '../server/static/auth-callback.html'), 'utf8');
const edgePath = join(root, '../supabase/functions/auth-callback/index.ts');

const header = `/**
 * Page HTTPS — invite / reset mot de passe (navigateur e-mail).
 * Flux hybride : app si installée · web sinon · modal install après MDP web.
 *
 * URL : https://<project>.supabase.co/functions/v1/auth-callback
 *
 * Corps HTML synchronisé depuis server/static/auth-callback.html :
 *   node scripts/sync-auth-callback-edge.mjs
 */
`;

const footer = `
Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      },
    });
  }

  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const html = HTML
    .replace('window.__SUPABASE_ANON__', JSON.stringify(anon))
    .replace('window.__SUPABASE_URL__', JSON.stringify(url));

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="auth-callback.html"',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
`;

const escaped = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const out = `${header}const HTML = \`${escaped}\`;${footer}`;
writeFileSync(edgePath, out, 'utf8');
console.log('OK —', edgePath);
