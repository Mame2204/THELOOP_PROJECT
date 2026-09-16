import 'dotenv/config';

export type BillingPeriod = 'monthly' | 'quarterly' | 'annual' | 'lifetime';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function parseBoolEnv(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

const djomyBaseUrl = optional('DJOMY_BASE_URL', 'https://sandbox-api.djomy.africa').replace(/\/$/, '');

function isDjomyProductionHost(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).host === 'api.djomy.africa';
  } catch {
    return false;
  }
}

const isDjomyProduction = isDjomyProductionHost(djomyBaseUrl);

/**
 * Code partenaire Djomy (hash côté marchand) — header `X-PARTNER-DOMAIN`.
 * Nom du header = « domain » ; valeur = le code fourni par Djomy (pas l’URL api.theloop-app.com).
 */
function resolveDjomyPartnerCode(): string {
  const fromApiKey = optional('DJOMY_PARTNER_API_KEY', '');
  if (fromApiKey) return fromApiKey;
  const fromCode = optional('DJOMY_PARTNER_CODE', '');
  if (fromCode) return fromCode;
  const legacyDomain = optional('DJOMY_PARTNER_DOMAIN', '');
  if (legacyDomain && !legacyDomain.includes('.')) return legacyDomain;
  return '';
}

const djomyPartnerCode = resolveDjomyPartnerCode();

if (isDjomyProduction && !djomyPartnerCode) {
  throw new Error(
    "Variable d'environnement manquante : DJOMY_PARTNER_API_KEY (code header X-PARTNER-DOMAIN)",
  );
}

const useSandboxAmounts =
  parseBoolEnv('PAYMENT_SANDBOX_AMOUNTS') || djomyBaseUrl.includes('sandbox-api.djomy');

const productionPassPrices = {
  monthly: parseIntEnv('PASS_PRICE_MONTHLY_GNF', 850_000),
  quarterly: parseIntEnv('PASS_PRICE_QUARTERLY_GNF', 2_400_000),
  annual: parseIntEnv('PASS_PRICE_ANNUAL_GNF', 8_500_000),
  lifetime: parseIntEnv('PASS_PRICE_LIFETIME_GNF', 25_000_000),
} satisfies Record<BillingPeriod, number>;

/** Montants réduits pour tests sandbox Orange Money / Djomy. */
const sandboxPassPrices = {
  monthly: parseIntEnv('PASS_SANDBOX_PRICE_MONTHLY_GNF', 1_000),
  quarterly: parseIntEnv('PASS_SANDBOX_PRICE_QUARTERLY_GNF', 2_500),
  annual: parseIntEnv('PASS_SANDBOX_PRICE_ANNUAL_GNF', 5_000),
  lifetime: parseIntEnv('PASS_SANDBOX_PRICE_LIFETIME_GNF', 10_000),
} satisfies Record<BillingPeriod, number>;

const nodeEnv = optional('NODE_ENV', 'development');
const cronSecret = optional('CRON_SECRET', '');

export const config = {
  port: parseIntEnv('PORT', 8787),
  nodeEnv,
  /** Secret pour POST /api/internal/cron (Render Cron, etc.). */
  cronSecret,
  /**
   * Push planifiés : timer interne au serveur (prod + CRON_SECRET par défaut).
   * Désactiver avec DISABLE_INTERNAL_PUSH_CRON=1 si un cron HTTP externe est utilisé.
   */
  internalPushCronEnabled:
    !parseBoolEnv('DISABLE_INTERNAL_PUSH_CRON')
    && (parseBoolEnv('ENABLE_INTERNAL_PUSH_CRON')
      || (nodeEnv === 'production' && Boolean(cronSecret))),
  pushCronIntervalMinutes: parseIntEnv('PUSH_CRON_INTERVAL_MINUTES', 5),
  corsOrigins: optional(
    'CORS_ORIGINS',
    [
      'http://localhost:8082',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://admin.theloop-app.com',
      'https://www.theloop-app.com',
      'https://theloop-app.com',
    ].join(','),
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  djomyBaseUrl,
  isDjomyProduction,
  djomyPartnerCode,
  djomyClientId: required('DJOMY_CLIENT_ID'),
  djomyClientSecret: required('DJOMY_CLIENT_SECRET'),
  djomyReturnUrl: required('DJOMY_RETURN_URL'),
  djomyCancelUrl: required('DJOMY_CANCEL_URL'),
  paymentSandboxAmounts: useSandboxAmounts,
  passPricesGnf: useSandboxAmounts ? sandboxPassPrices : productionPassPrices,
};

export function passLabel(period: BillingPeriod): string {
  const labels: Record<BillingPeriod, string> = {
    monthly: 'PASS mensuel',
    quarterly: 'PASS trimestriel',
    annual: 'PASS annuel',
    lifetime: 'PASS à vie',
  };
  return labels[period];
}

export function computePassExpiry(period: BillingPeriod, from = new Date()): string | null {
  if (period === 'lifetime') return null;
  const end = new Date(from);
  if (period === 'monthly') end.setMonth(end.getMonth() + 1);
  else if (period === 'quarterly') end.setMonth(end.getMonth() + 3);
  else if (period === 'annual') end.setFullYear(end.getFullYear() + 1);
  return end.toISOString();
}
