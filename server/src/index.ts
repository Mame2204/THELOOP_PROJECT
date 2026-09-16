import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { probeDjomyAuth, type DjomyAuthProbe } from './lib/djomy.js';
import { requestLogger } from './middleware/request-logger.js';
import { adminRouter } from './routes/admin.js';
import { partnerValidationRouter } from './routes/partner-validation.js';
import { partnerBenefitOffersRouter } from './routes/partner-benefit-offers.js';
import { partnerSpotSessionRouter } from './routes/partner-spot-session.js';
import { paymentsRouter } from './routes/payments.js';
import { publicPagesRouter } from './routes/public-pages.js';
import { webhookRouter } from './routes/webhook.js';
import { cronRouter } from './routes/cron.js';
import { startInternalPushCron } from './services/internal-push-cron.js';

const app = express();

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

app.get('/health', async (_req, res) => {
  const djomyAuth = await getDjomyProbeCached();
  res.json({
    ok: djomyAuth.ok,
    service: 'the-loop-payment-server',
    env: config.nodeEnv,
    sandboxMode: config.paymentSandboxAmounts,
    djomyHost: new URL(config.djomyBaseUrl).host,
    djomyProduction: config.isDjomyProduction,
    partnerApiConfigured: Boolean(config.djomyPartnerApiKey),
    djomyAuthOk: djomyAuth.ok,
    djomyAuthStatus: djomyAuth.httpStatus ?? null,
    djomyAuthHint: djomyAuth.ok ? null : djomyAuth.hint ?? null,
    cronConfigured: Boolean(config.cronSecret),
    internalPushCron: config.internalPushCronEnabled,
    pushCronIntervalMinutes: config.pushCronIntervalMinutes,
    publicBaseHint: 'https://api.theloop-app.com',
  });
});

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
  console.log(`[payment-server] Écoute sur 0.0.0.0:${config.port} (${config.nodeEnv})`);
  console.log(`[payment-server] Djomy base: ${config.djomyBaseUrl}`);
  if (config.isDjomyProduction) {
    console.log('[payment-server] Djomy production — X-PARTNER-API activé');
  }
  console.log(`[payment-server] CORS: ${config.corsOrigins.join(', ') || '(vide)'}`);
  if (config.paymentSandboxAmounts) {
    console.log('[payment-server] Montants sandbox GNF:', config.passPricesGnf);
  }
  startInternalPushCron();
});
