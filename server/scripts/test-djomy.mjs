import 'dotenv/config';
import { createHmac } from 'node:crypto';

const base = process.env.DJOMY_BASE_URL?.replace(/\/$/, '') || 'https://sandbox-api.djomy.africa';
const clientId = process.env.DJOMY_CLIENT_ID;
const clientSecret = process.env.DJOMY_CLIENT_SECRET;
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

function hmac(message, secret) {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

function authHeaders(extra = {}) {
  const headers = {
    'X-API-KEY': `${clientId}:${hmac(clientId, clientSecret)}`,
    ...extra,
  };
  if (partnerDomain) headers['X-PARTNER-DOMAIN'] = partnerDomain;
  return headers;
}

function signedHeaders(extra = {}) {
  return authHeaders(extra);
}

async function auth() {
  const res = await fetch(`${base}/v1/auth`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
  const raw = await res.text();
  console.log('AUTH status', res.status);
  if (!res.ok) {
    console.log(raw.startsWith('{') ? raw : raw.slice(0, 200));
    return null;
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    console.log('Réponse non JSON:', raw.slice(0, 200));
    return null;
  }
  console.log(JSON.stringify(body, null, 2));
  if (!body.success) return null;
  return body.data.accessToken;
}

async function gateway(token, payerNumber) {
  const payload = {
    amount: 1000,
    countryCode: 'GN',
    payerNumber,
    allowedPaymentMethods: ['OM'],
    description: 'THE LOOP test',
    merchantPaymentReference: `TEST-${Date.now()}`,
    returnUrl: process.env.DJOMY_RETURN_URL,
    cancelUrl: process.env.DJOMY_CANCEL_URL,
  };
  const res = await fetch(`${base}/v1/payments/gateway`, {
    method: 'POST',
    headers: signedHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  console.log(`\nGATEWAY payerNumber=${payerNumber}`);
  console.log('status', res.status, JSON.stringify(body, null, 2));
  return body;
}

const token = await auth();
if (!token) process.exit(1);

await gateway(token, '224620000001');
await gateway(token, '00224620000001');
await gateway(token, '00224623707722');
