import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 hex — même algorithme que la spec Djomy (afro.tools). */
export function computeHmacHex(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
