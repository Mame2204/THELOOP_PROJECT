import { config } from '../config.js';
import { computeHmacHex, safeEqualHex } from './hmac.js';

export type GatewayPaymentMethod = 'OM' | 'MOMO' | 'SOUTRA_MONEY' | 'PAYCARD' | 'CARD';

/** Méthodes supportées par create_payment_gateway (doc Djomy / afro.tools). */
export const DJOMY_GATEWAY_METHODS: GatewayPaymentMethod[] = [
  'OM',
  'MOMO',
  'SOUTRA_MONEY',
  'PAYCARD',
  'CARD',
];

export type AppPaymentMethod =
  | 'all'
  | 'orange_money'
  | 'mtn_momo'
  | 'soutra_money'
  | 'paycard'
  | 'card';

interface DjomyResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error: { code: number; message: string; details: string; fieldsErrors: string[] } | null;
  timestamp: string;
  status: number;
}

export interface CreatePaymentGatewayInput {
  amount: number;
  countryCode: string;
  payerNumber: string;
  allowedPaymentMethods?: GatewayPaymentMethod[];
  description?: string;
  merchantPaymentReference: string;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface CreatedPaymentGatewayData {
  transactionId: string;
  status: string;
  paidAmount: number;
  paymentMethod: string;
  merchantPaymentReference?: string;
  redirectUrl: string;
  paymentUrl?: string;
  allowedPaymentMethods: string[];
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface VerifiedPaymentData {
  transactionId: string;
  status: string;
  paidAmount?: number;
  receivedAmount?: number;
  merchantPaymentReference?: string;
  paymentMethod?: string;
  providerReference?: string;
  payerIdentifier?: string;
  metadata?: Record<string, unknown>;
}

function apiKeyHeader(): string {
  const signature = computeHmacHex(config.djomyClientId, config.djomyClientSecret);
  return `${config.djomyClientId}:${signature}`;
}

function withPartnerDomainHeader(headers: Record<string, string>): Record<string, string> {
  if (config.djomyPartnerCode) {
    headers['X-PARTNER-DOMAIN'] = config.djomyPartnerCode;
  }
  return headers;
}

/** Auth + paiements — X-API-KEY + X-PARTNER-DOMAIN (code marchand Djomy) sur toutes les requêtes. */
function djomyAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  return withPartnerDomainHeader({
    'X-API-KEY': apiKeyHeader(),
    ...extra,
  });
}

/** Paiements / statut — X-API-KEY + Bearer + X-PARTNER-DOMAIN. */
function djomySignedHeaders(extra?: Record<string, string>): Record<string, string> {
  return djomyAuthHeaders(extra);
}

async function readDjomyErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text.trim()) return '';
    try {
      const parsed = JSON.parse(text) as DjomyResponse<unknown>;
      return parsed.error?.message ?? parsed.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return '';
  }
}

function isCloudflareOrHtmlBlock(detail?: string): boolean {
  const t = detail?.toLowerCase() ?? '';
  return t.includes('<html') || t.includes('cloudflare') || t.includes('403 forbidden');
}

export function formatDjomyAuthError(status: number, detail?: string): string {
  const trimmed = detail?.trim();
  if (status === 403 && isCloudflareOrHtmlBlock(trimmed)) {
    if (config.isDjomyProduction) {
      return [
        'Djomy production bloque la requête avant l’API (403 HTML Cloudflare/nginx).',
        'Ce n’est pas une erreur « mauvais secret » (celle-ci renvoie 401 JSON).',
        'Cause la plus probable : compte marchand prod pas encore activé pour l’API, ou restriction IP/domaine côté Djomy.',
        'Action : contacter le support Djomy avec le Client ID prod et POST https://api.djomy.africa/v1/auth → 403.',
        'En attendant : sandbox sur Render (DJOMY_BASE_URL=sandbox-api.djomy.africa, clés sandbox, PAYMENT_SANDBOX_AMOUNTS=1).',
      ].join(' ');
    }
    return 'Djomy sandbox inaccessible (403). Vérifiez DJOMY_CLIENT_ID et DJOMY_CLIENT_SECRET sur le serveur.';
  }
  if (status === 403) {
    return [
      'Authentification Djomy refusée (HTTP 403).',
      'Vérifiez DJOMY_CLIENT_ID, DJOMY_CLIENT_SECRET et DJOMY_BASE_URL (sandbox vs production).',
      config.isDjomyProduction && !config.djomyPartnerCode
        ? 'En production, DJOMY_PARTNER_API_KEY est obligatoire (header X-PARTNER-DOMAIN).'
        : null,
      trimmed ? `Détail Djomy : ${trimmed.slice(0, 180)}` : null,
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (status === 401) {
    return `Identifiants Djomy invalides (HTTP 401)${trimmed ? ` — ${trimmed}` : ''}.`;
  }
  return `Djomy auth HTTP ${status}${trimmed ? ` — ${trimmed}` : ''}`;
}

export type DjomyAuthProbe = {
  ok: boolean;
  httpStatus?: number;
  hint?: string;
  /** true si les mêmes clés passent sur sandbox-api.djomy.africa mais pas en prod. */
  sandboxKeysOnProd?: boolean;
};

async function probeAuthOnHost(baseUrl: string): Promise<{ ok: boolean; httpStatus: number; detail: string }> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/auth`, {
    method: 'POST',
    headers: djomyAuthHeaders({ 'Content-Type': 'application/json' }),
  });
  const detail = response.ok ? '' : await readDjomyErrorBody(response);
  return { ok: response.ok, httpStatus: response.status, detail };
}

/** Test léger auth Djomy — utilisé par /health (diagnostic Render). */
export async function probeDjomyAuth(): Promise<DjomyAuthProbe> {
  try {
    const primary = await probeAuthOnHost(config.djomyBaseUrl);
    if (primary.ok) {
      return { ok: true, httpStatus: primary.httpStatus };
    }

    let hint = formatDjomyAuthError(primary.httpStatus, primary.detail);
    let sandboxKeysOnProd = false;

    if (
      config.isDjomyProduction
      && primary.httpStatus === 403
      && isCloudflareOrHtmlBlock(primary.detail)
    ) {
      const sandbox = await probeAuthOnHost('https://sandbox-api.djomy.africa');
      if (sandbox.ok) {
        sandboxKeysOnProd = true;
        hint = [
          'Les clés configurées authentifient le sandbox Djomy mais pas la production (403 HTML sur api.djomy.africa).',
          'Demandez à Djomy : credentials PRODUCTION + code X-PARTNER-DOMAIN + activation API marchand prod.',
          'Webhook à valider : https://api.theloop-app.com/api/webhook/djomy',
        ].join(' ');
      }
    }

    return {
      ok: false,
      httpStatus: primary.httpStatus,
      hint,
      sandboxKeysOnProd,
    };
  } catch (err) {
    return {
      ok: false,
      hint: err instanceof Error ? err.message : 'Djomy injoignable',
    };
  }
}

async function getAccessToken(): Promise<string> {
  const response = await fetch(`${config.djomyBaseUrl}/v1/auth`, {
    method: 'POST',
    headers: djomyAuthHeaders({ 'Content-Type': 'application/json' }),
  });

  if (!response.ok) {
    const detail = await readDjomyErrorBody(response);
    throw new Error(formatDjomyAuthError(response.status, detail));
  }

  const result = (await response.json()) as DjomyResponse<{ accessToken: string }>;
  if (!result.success) {
    throw new Error(`Djomy auth : ${result.error?.message ?? result.message}`);
  }
  return result.data.accessToken;
}

export async function createPaymentGateway(
  input: CreatePaymentGatewayInput,
): Promise<CreatedPaymentGatewayData> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${config.djomyBaseUrl}/v1/payments/gateway`, {
    method: 'POST',
    headers: djomySignedHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      amount: input.amount,
      countryCode: input.countryCode,
      payerNumber: input.payerNumber,
      merchantPaymentReference: input.merchantPaymentReference,
      returnUrl: input.returnUrl ?? config.djomyReturnUrl,
      cancelUrl: input.cancelUrl ?? config.djomyCancelUrl,
      ...(input.allowedPaymentMethods && { allowedPaymentMethods: input.allowedPaymentMethods }),
      ...(input.description && { description: input.description }),
      ...(input.metadata && { metadata: input.metadata }),
    }),
  });

  const result = (await response.json()) as DjomyResponse<CreatedPaymentGatewayData>;
  if (!result.success) {
    const detail = result.error?.message ?? result.error?.details ?? result.message;
    throw new Error(`Djomy create_payment_gateway : ${detail}`);
  }

  return result.data;
}

export async function verifyPayment(transactionId: string): Promise<VerifiedPaymentData> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${config.djomyBaseUrl}/v1/payments/${transactionId}/status`, {
    method: 'GET',
    headers: djomySignedHeaders({ Authorization: `Bearer ${accessToken}` }),
  });

  const result = (await response.json()) as DjomyResponse<VerifiedPaymentData>;
  if (!result.success) {
    throw new Error(`Djomy verify_payment : ${result.error?.message ?? result.message}`);
  }
  return result.data;
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const [version, sig] = signatureHeader.split(':');
  if (version !== 'v1' || !sig) return false;
  const expected = computeHmacHex(rawBody, config.djomyClientSecret);
  return safeEqualHex(expected, sig);
}

export function resolvePaymentUrl(data: CreatedPaymentGatewayData): string {
  return data.paymentUrl?.trim() || data.redirectUrl?.trim() || '';
}

export function parseAppPaymentMethod(raw: unknown): AppPaymentMethod {
  if (raw === 'orange_money' || raw === 'mtn_momo' || raw === 'soutra_money' || raw === 'paycard' || raw === 'card') {
    return raw;
  }
  return 'all';
}

/**
 * Mappe le choix app → allowedPaymentMethods Djomy.
 * `all` → undefined : le portail Djomy affiche tout ce qu'active votre compte marchand.
 */
export function mapPaymentMethodToDjomy(method: AppPaymentMethod): GatewayPaymentMethod[] | undefined {
  switch (method) {
    case 'all':
      return undefined;
    case 'orange_money':
      return ['OM'];
    case 'mtn_momo':
      return ['MOMO'];
    case 'soutra_money':
      return ['SOUTRA_MONEY'];
    case 'paycard':
      return ['PAYCARD'];
    case 'card':
      return ['CARD'];
    default:
      return undefined;
  }
}
