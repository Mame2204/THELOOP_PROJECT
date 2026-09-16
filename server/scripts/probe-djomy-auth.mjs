import 'dotenv/config';

import { createHmac } from 'node:crypto';



const clientId = process.env.DJOMY_CLIENT_ID?.trim() ?? '';

const clientSecret = process.env.DJOMY_CLIENT_SECRET?.trim() ?? '';

function resolvePartnerDomain() {
  const explicit = process.env.DJOMY_PARTNER_DOMAIN?.trim();
  if (explicit) {
    return explicit.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/')[0];
  }
  const returnUrl = process.env.DJOMY_RETURN_URL?.trim();
  if (returnUrl) {
    try {
      return new URL(returnUrl).host;
    } catch {
      return '';
    }
  }
  return '';
}

const partnerDomain = resolvePartnerDomain();

const configuredBase = process.env.DJOMY_BASE_URL?.replace(/\/$/, '') ?? 'https://sandbox-api.djomy.africa';



const PROD_BASE = 'https://api.djomy.africa';

const SANDBOX_BASE = 'https://sandbox-api.djomy.africa';



function hmac(message, secret) {

  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');

}



function maskId(id) {

  if (id.length <= 8) return '***';

  return `${id.slice(0, 12)}…${id.slice(-4)}`;

}



function decodeJwtPayload(token) {

  try {

    const part = token.split('.')[1];

    if (!part) return null;

    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

  } catch {

    return null;

  }

}



async function probeAuth(baseUrl) {

  const base = baseUrl.replace(/\/$/, '');

  const headers = {
    'X-API-KEY': `${clientId}:${hmac(clientId, clientSecret)}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'THE-LOOP-probe/1.0',
  };
  if (partnerDomain) headers['X-PARTNER-DOMAIN'] = partnerDomain;



  const res = await fetch(`${base}/v1/auth`, { method: 'POST', headers });

  const raw = await res.text();

  const isJson = raw.trim().startsWith('{');

  let parsed = null;

  if (isJson) {

    try {

      parsed = JSON.parse(raw);

    } catch {

      parsed = null;

    }

  }



  return {

    base,

    status: res.status,

    isJson,

    cfRay: res.headers.get('cf-ray'),

    body: isJson ? raw.slice(0, 320) : raw.replace(/\s+/g, ' ').slice(0, 120),

    parsed,

  };

}



function printResult(label, result) {

  console.log(`\n[${label}]`);

  console.log('  url:', `${result.base}/v1/auth`);

  console.log('  status:', result.status, result.isJson ? 'json' : 'html/block');

  console.log('  cf-ray:', result.cfRay ?? '(none)');

  console.log('  body:', result.body);

  if (result.parsed?.data?.accessToken) {

    const payload = decodeJwtPayload(result.parsed.data.accessToken);

    if (payload) {

      console.log('  merchant:', payload.merchantName ?? '(inconnu)');

      console.log('  scope:', payload.scope ?? '(inconnu)');

    }

  }

}



console.log('=== Djomy auth probe (sans afficher les secrets) ===');

console.log('clientId:', maskId(clientId));

console.log('secret length:', clientSecret.length, clientSecret.includes('\n') ? '(contient un saut de ligne!)' : '');

console.log('partner domain:', partnerDomain || '(non configuré)');

console.log('env DJOMY_BASE_URL:', configuredBase);



if (!clientId || !clientSecret) {

  console.error('DJOMY_CLIENT_ID / DJOMY_CLIENT_SECRET manquants dans .env');

  process.exit(1);

}



const prod = await probeAuth(PROD_BASE);

const sandbox = await probeAuth(SANDBOX_BASE);



printResult('production', prod);

printResult('sandbox', sandbox);



console.log('\n=== Verdict ===');

if (prod.status === 200) {

  console.log('OK — Production Djomy accessible. Paiement PASS possible.');

  process.exit(0);

}



if (prod.status === 403 && !prod.isJson && sandbox.status === 200) {

  console.log(

    [

      'BLOQUÉ — Les clés actuelles authentifient le SANDBOX mais pas la PRODUCTION.',

      'Ce n’est pas un bug THE LOOP : POST api.djomy.africa/v1/auth renvoie 403 HTML avant l’API.',

      '',

      'Actions côté Djomy (obligatoires pour la prod) :',

      '  1. Fournir les credentials PRODUCTION (dashboard marchand prod, pas sandbox).',

      '  2. Whitelister le domaine (header X-PARTNER-DOMAIN, ex. api.theloop-app.com).',

      '  3. Activer l’API marchand sur api.djomy.africa pour ce Client ID.',

      '  4. Valider le domaine webhook : https://api.theloop-app.com/api/webhook/djomy',

      '',

      'Variables Render une fois les clés prod reçues :',

      '  DJOMY_BASE_URL=https://api.djomy.africa',

      '  PAYMENT_SANDBOX_AMOUNTS=0',

      '  DJOMY_CLIENT_ID=<prod>',

      '  DJOMY_CLIENT_SECRET=<prod>',

      '  DJOMY_PARTNER_DOMAIN=api.theloop-app.com',

    ].join('\n'),

  );

  process.exit(2);

}



if (prod.status === 401) {

  console.log('ÉCHEC — Identifiants production invalides (401). Vérifiez CLIENT_ID / SECRET prod sur Render.');

  process.exit(3);

}



console.log(`ÉCHEC — Production HTTP ${prod.status}. Transmettre ce log au support Djomy.`);

process.exit(4);

