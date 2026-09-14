import { resolveRemoteImageUrl } from '@/lib/resolve-image-url';

/**
 * Anciennement : probe Range GET + list() Storage sur chaque image.
 * Désactivé — responsable majeur de l’explosion d’egress (~Go en test).
 * On renvoie l’URL résolue telle quelle ; RemoteImage gère le fallback render.
 */
export async function ensureStorageImageAvailable(
  raw: string | null | undefined,
): Promise<string | null> {
  return resolveRemoteImageUrl(raw);
}

export function extractContentMediaFolder(_publicUrl: string): string | null {
  return null;
}

export function buildContentMediaPublicUrl(_objectPath: string): string | null {
  return null;
}
