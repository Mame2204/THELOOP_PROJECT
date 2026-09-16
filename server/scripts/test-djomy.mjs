import 'dotenv/config';
import { createHmac } from 'node:crypto';

const base = process.env.DJOMY_BASE_URL?.replace(/\/$/, '') || 'https://sandbox-api.djomy.africa';
const clientId = process.env.DJOMY_CLIENT_ID;
const clientSecret = process.env.DJOMY_CLIENT_SECRET;
const partnerApiKey = process.env.DJOMY_PARTNER_API_KEY?.trim() ?? '';

function hmac(message, secret) {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

function authHeaders(extra = {}) {
  return {
    'X-API-KEY': `${clientId}:${hmac(clientId, clientSecret)}`,
    ...extra,
  };
}

function signedHeaders(extra = {}) {
  const headers = authHeaders(extra);
  if (partnerApiKey) headers['X-PARTNER-API'] = partnerApiKey;
  return headers;
}

async function auth() {
  const res = await fetch(`${base}/v1/auth`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  });
  const body = await res.json();
  console.log('AUTH status', res.status, JSON.stringify(body, null, 2));
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
