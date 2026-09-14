/**
 * Vérifie que le serveur peut résoudre prix + file depuis app_settings
 * (alignement admin ↔ Djomy). Exécuter avec le serveur capable de lire Supabase :
 *
 *   cd server
 *   node --import tsx scripts/check-pass-commerce.mjs
 *
 * Ou après build : node dist/... (préférer tsx sur les sources).
 */
import 'dotenv/config';

async function main() {
  const { resolveChargedPassPrice, resolveMaxPendingPasses } = await import(
    '../src/lib/pass-commerce-settings.ts'
  );
  const { config } = await import('../src/config.ts');

  const periods = ['monthly', 'quarterly', 'annual', 'lifetime'];
  console.log('[check-pass-commerce] sandboxAmounts=', config.paymentSandboxAmounts);
  console.log('[check-pass-commerce] envPrices=', config.passPricesGnf);

  const maxPending = await resolveMaxPendingPasses('GN');
  console.log('[check-pass-commerce] maxPendingPasses=', maxPending);

  for (const period of periods) {
    const amount = await resolveChargedPassPrice(period, 'GN');
    console.log(`[check-pass-commerce] ${period}=`, amount);
  }

  console.log('[check-pass-commerce] OK — checklist manuelle : voir server/README.md § Checklist sandbox');
}

main().catch((err) => {
  console.error('[check-pass-commerce] ÉCHEC', err);
  process.exit(1);
});
