import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { probeDjomyAuth, type DjomyAuthProbe } from './lib/djomy.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { adminRouter } from './routes/admin.js';
import { partnerValidationRouter } from './routes/partner-validation.js';
import { partnerBenefitOffersRouter } from './routes/partner-benefit-offers.js';
import { partnerSpotSessionRouter } from './routes/partner-spot-session.js';
import { paymentsRouter } from './routes/payments.js';
import { authCallbackPageRouter } from './routes/auth-callback-page.js';
import { publicPagesRouter } from './routes/public-pages.js';
import { webhookRouter } from './routes/webhook.js';
import { cronRouter } from './routes/cron.js';
import { startInternalPushCron } from './services/internal-push-cron.js';
import { syncSupabaseAuthConfigIfNeeded } from './boot/sync-auth-config.js';
import { syncAuthRecoveryStorageIfNeeded } from './boot/sync-auth-recovery-storage.js';
import { syncAuthEmailTemplatesIfNeeded } from './boot/sync-auth-email-templates.js';

const app = express();

// Render place l'app derrière un proxy : sans cela, le limiteur voit une seule IP pour tout le trafic.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    // Djomy / Soutra chargent parfois returnUrl en iframe ou via fetch cross-origin.
    // same-origin provoque un « request failed » côté portail alors que le paiement est OK.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  }),
);
app.use(requestLogger);
app.use(
  cors({
    origin: (origin, callback) => {
      // Apps natives / healthchecks sans Origin
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      console.warn('[cors] Origin refusée:', origin);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
);

app.use(globalLimiter);

app.use('/api/webhook/djomy', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));

let djomyProbeCache: { at: number; value: DjomyAuthProbe } | null = null;
const DJOMY_PROBE_TTL_MS = 60_000;

async function getDjomyProbeCached(): Promise<DjomyAuthProbe> {
  const now = Date.now();
  if (djomyProbeCache && now - djomyProbeCache.at < DJOMY_PROBE_TTL_MS) {
    return djomyProbeCache.value;
  }
  const value = await probeDjomyAuth();
  djomyProbeCache = { at: now, value };
  return value;
}

/** Page légère pendant le réveil Render (évite l’écran noir « Welcome to Render » une fois Node démarré). */
app.get('/', (_req, res) => {
  res
    .status(200)
    .type('html')
    .send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f4fcfd" />
  <title>THE LOOP — Connexion…</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      font-family:system-ui,sans-serif; background:#f4fcfd; color:#0a0a0a; }
    .box { text-align:center; padding:32px 24px; max-width:360px; }
    .spin { width:40px; height:40px; border:3px solid #e2e8f0; border-top-color:#12a8bc;
      border-radius:50%; animation:spin 0.9s linear infinite; margin:0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { margin:8px 0 0; font-size:14px; color:#636e72; line-height:1.5; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spin" aria-hidden="true"></div>
    <strong>THE LOOP</strong>
    <p>Le service se réveille… Réessayez dans quelques secondes ou rouvrez le lien.</p>
  </div>
</body>
</html>`);
});

app.get('/health', async (_req, res) => {
  const djomyAuth = await getDjomyProbeCached();
  res.json({
    ok: djomyAuth.ok,
    service: 'the-loop-payment-server',
    env: config.nodeEnv,
    sandboxMode: config.paymentSandboxAmounts,
    djomyHost: new URL(config.djomyBaseUrl).host,
    djomyProduction: config.isDjomyProduction,
    partnerCodeConfigured: Boolean(config.djomyPartnerCode),
    partnerHeader: config.djomyPartnerCode ? 'X-PARTNER-DOMAIN' : null,
    djomyAuthOk: djomyAuth.ok,
    djomyAuthStatus: djomyAuth.httpStatus ?? null,
    djomySandboxKeysOnProd: djomyAuth.sandboxKeysOnProd ?? false,
    djomyAuthHint: djomyAuth.ok ? null : djomyAuth.hint ?? null,
    anonKeyConfigured: Boolean(config.supabaseAnonKey),
    cronConfigured: Boolean(config.cronSecret),
    internalPushCron: config.internalPushCronEnabled,
    pushCronIntervalMinutes: config.pushCronIntervalMinutes,
    publicBaseHint: 'https://api.theloop-app.com',
  });
});

app.use(authCallbackPageRouter);
app.use(publicPagesRouter);
app.use('/api', paymentsRouter);
app.use('/api', partnerValidationRouter);
app.use('/api', partnerBenefitOffersRouter);
app.use('/api', partnerSpotSessionRouter);
app.use('/api', adminRouter);
app.use('/api', webhookRouter);
app.use('/api', cronRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

app.listen(config.port, '0.0.0.0', () => {
  void syncAuthRecoveryStorageIfNeeded(true).catch((err) => {
    console.warn('[auth-sync] Storage:', err instanceof Error ? err.message : err);
  });
  void syncSupabaseAuthConfigIfNeeded(true).catch((err) => {
    console.warn('[auth-sync] Auth config:', err instanceof Error ? err.message : err);
  });
  void syncAuthEmailTemplatesIfNeeded(true).catch((err) => {
    console.warn('[auth-sync] E-mail templates:', err instanceof Error ? err.message : err);
  });

  console.log(`[payment-server] Écoute sur 0.0.0.0:${config.port} (${config.nodeEnv})`);
  console.log(`[payment-server] Djomy base: ${config.djomyBaseUrl}`);
  if (config.isDjomyProduction) {
    console.log('[payment-server] Djomy production — header X-PARTNER-DOMAIN configuré');
  }
  console.log(`[payment-server] CORS: ${config.corsOrigins.join(', ') || '(vide)'}`);
  if (config.paymentSandboxAmounts) {
    console.log('[payment-server] Montants sandbox GNF:', config.passPricesGnf);
  }
  startInternalPushCron();
});
