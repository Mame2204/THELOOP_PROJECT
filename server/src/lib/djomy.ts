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

/** POST /v1/auth — spec Djomy : X-API-KEY uniquement (pas X-PARTNER-API). */
function djomyAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-API-KEY': apiKeyHeader(),
    ...extra,
  };
}

/** Paiements / statut — X-API-KEY + Bearer ; X-PARTNER-API en production. */
function djomySignedHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers = djomyAuthHeaders(extra);
  if (config.djomyPartnerApiKey) {
    headers['X-PARTNER-API'] = config.djomyPartnerApiKey;
  }
  return headers;
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
        'Djomy production refuse la connexion (403).',
        'Cause la plus fréquente : clés SANDBOX sur Render alors que DJOMY_BASE_URL = api.djomy.africa.',
        'Pour tester : DJOMY_BASE_URL=https://sandbox-api.djomy.africa, PAYMENT_SANDBOX_AMOUNTS=1, PARTNER_API_KEY vide, clés sandbox — puis redeploy Render.',
        'Pour la prod réelle : clés production dashboard Djomy + DJOMY_PARTNER_API_KEY.',
      ].join(' ');
    }
    return 'Djomy sandbox inaccessible (403). Vérifiez DJOMY_CLIENT_ID et DJOMY_CLIENT_SECRET sur le serveur.';
  }
  if (status === 403) {
    return [
      'Authentification Djomy refusée (HTTP 403).',
      'Vérifiez DJOMY_CLIENT_ID, DJOMY_CLIENT_SECRET et DJOMY_BASE_URL (sandbox vs production).',
      config.isDjomyProduction && !config.djomyPartnerApiKey
        ? 'En production, DJOMY_PARTNER_API_KEY est obligatoire.'
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
};

/** Test léger auth Djomy — utilisé par /health (diagnostic Render). */
export async function probeDjomyAuth(): Promise<DjomyAuthProbe> {
  try {
    const response = await fetch(`${config.djomyBaseUrl}/v1/auth`, {
      method: 'POST',
      headers: djomyAuthHeaders({ 'Content-Type': 'application/json' }),
    });
    if (response.ok) {
      return { ok: true, httpStatus: response.status };
    }
    const detail = await readDjomyErrorBody(response);
    return {
      ok: false,
      httpStatus: response.status,
      hint: formatDjomyAuthError(response.status, detail),
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
