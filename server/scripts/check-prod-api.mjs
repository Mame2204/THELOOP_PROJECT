#!/usr/bin/env node
/**
 * Vérifie que l’API prod répond (après DNS + deploy).
 * Usage: node server/scripts/check-prod-api.mjs
 */
const base = (process.env.API_BASE_URL || 'https://api.theloop-app.com').replace(/\/$/, '');

async function main() {
  const url = `${base}/health`;
  console.log('GET', url);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await res.text();
    console.log('HTTP', res.status);
    console.log(text);
    if (!res.ok) process.exit(1);
    const json = JSON.parse(text);
    if (!json.ok) process.exit(1);
    console.log('\nOK — API joignable. Branchez le webhook Djomy et rebuild EAS si besoin.');
  } catch (err) {
    console.error('ÉCHEC — DNS / deploy pas prêts :', err instanceof Error ? err.message : err);
    console.error('Suivre server/DEPLOY.md (Render + CNAME api).');
    process.exit(1);
  }
}

void main();
