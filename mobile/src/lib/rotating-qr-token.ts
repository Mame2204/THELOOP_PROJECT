import * as Crypto from 'expo-crypto';

/** Fenêtres acceptées (génération 30 s + legacy 2 min pour scan). */
const ROTATING_QR_WINDOW_MS_LIST = [30_000, 120_000] as const;

/** Fenêtre active pour la génération du QR affiché. */
export const ROTATING_QR_WINDOW_MS = ROTATING_QR_WINDOW_MS_LIST[0];

export const ROTATING_QR_WINDOW_SECONDS = ROTATING_QR_WINDOW_MS / 1000;

export function formatRotatingQrWindowLabel(): string {
  if (ROTATING_QR_WINDOW_SECONDS >= 60) {
    const minutes = ROTATING_QR_WINDOW_SECONDS / 60;
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return `${ROTATING_QR_WINDOW_SECONDS} secondes`;
}

const PREFIX = 'LOOP';

function normalizeSecret(secret: string): string {
  return secret.trim().toUpperCase();
}

export function shortUserId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function getRotatingQrSlot(at = Date.now(), windowMs: number = ROTATING_QR_WINDOW_MS): number {
  return Math.floor(at / windowMs);
}

export function msUntilNextRotatingQr(at = Date.now()): number {
  const slot = getRotatingQrSlot(at);
  return (slot + 1) * ROTATING_QR_WINDOW_MS - at;
}

export function secondsUntilNextRotatingQr(at = Date.now()): number {
  return Math.max(0, Math.ceil(msUntilNextRotatingQr(at) / 1000));
}

async function digestSlotCode(secret: string, userId: string, slot: number): Promise<string> {
  const material = `${normalizeSecret(secret)}:${userId}:${slot}`;
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, material, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return hex.slice(0, 10).toUpperCase();
}

/** Payload encodé dans le QR — recalculable côté serveur sans appel réseau côté mobile. */
export async function buildRotatingQrPayload(
  userId: string,
  secret: string,
  slot: number = getRotatingQrSlot(),
): Promise<string> {
  const code = await digestSlotCode(secret, userId, slot);
  return `${PREFIX}-${shortUserId(userId)}-${slot}-${code}`;
}

export interface ParsedRotatingQrPayload {
  userIdShort: string;
  slot: number;
  code: string;
}

export function parseRotatingQrPayload(payload: string): ParsedRotatingQrPayload | null {
  const match = /^LOOP-([A-Z0-9]{8})-(\d+)-([A-Z0-9]{10})$/.exec(payload.trim().toUpperCase());
  if (!match) return null;
  return {
    userIdShort: match[1],
    slot: Number(match[2]),
    code: match[3],
  };
}

/** Vérifie un QR scanné (fenêtre courante ±1 pour tolérance d'horloge). */
export async function verifyRotatingQrPayload(
  payload: string,
  secret: string,
  userId: string,
  at = Date.now(),
): Promise<boolean> {
  const parsed = parseRotatingQrPayload(payload);
  if (!parsed) return false;
  if (parsed.userIdShort !== shortUserId(userId)) return false;

  for (const windowMs of ROTATING_QR_WINDOW_MS_LIST) {
    const slotBase = getRotatingQrSlot(at, windowMs);
    for (const slot of [slotBase - 1, slotBase, slotBase + 1]) {
      if (slot < 0) continue;
      const expected = await digestSlotCode(secret, userId, slot);
      if (expected === parsed.code && parsed.slot === slot) return true;
    }
  }
  return false;
}
