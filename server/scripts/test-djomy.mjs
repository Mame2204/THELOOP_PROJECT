import 'dotenv/config';
import { createHmac } from 'node:crypto';

const base = process.env.DJOMY_BASE_URL?.replace(/\/$/, '') || 'https://sandbox-api.djomy.africa';
const clientId = process.env.DJOMY_CLIENT_ID;
const clientSecret = process.env.DJOMY_CLIENT_SECRET;

function hmac(message, secret) {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

async function auth() {
  const sig = hmac(clientId, clientSecret);
  const res = await fetch(`${base}/v1/auth`, {
    method: 'POST',
    headers: {
      'X-API-KEY': `${clientId}:${sig}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json();
  console.log('AUTH status', res.status, JSON.stringify(body, null, 2));
  if (!body.success) return null;
  return body.data.accessToken;
}

async function gateway(token, payerNumber) {
  const sig = hmac(clientId, clientSecret);
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
    headers: {
      Authorization: `Bearer ${token}`,
      'X-API-KEY': `${clientId}:${sig}`,
      'Content-Type': 'application/json',
    },
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
