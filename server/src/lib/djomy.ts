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

/** Headers communs Djomy (auth, gateway, verify). X-PARTNER-API requis en production. */
function djomyRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'X-API-KEY': apiKeyHeader(),
    ...extra,
  };
  if (config.djomyPartnerApiKey) {
    headers['X-PARTNER-API'] = config.djomyPartnerApiKey;
  }
  return headers;
}

async function getAccessToken(): Promise<string> {
  const response = await fetch(`${config.djomyBaseUrl}/v1/auth`, {
    method: 'POST',
    headers: djomyRequestHeaders({ 'Content-Type': 'application/json' }),
  });

  if (!response.ok) {
    throw new Error(`Djomy auth HTTP ${response.status}`);
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
    headers: djomyRequestHeaders({
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
    headers: djomyRequestHeaders({ Authorization: `Bearer ${accessToken}` }),
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
