const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'content://', 'assets-library://'] as const;
const CONTENT_MEDIA_BUCKET = 'content-media';
const SUPABASE_OBJECT_PREFIX = '/storage/v1/object/public/';

function isLocalDeviceUri(value: string): boolean {
  const lower = value.toLowerCase();
  return LOCAL_URI_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function supabaseProjectUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!url || url.includes('your-project')) return null;
  return url;
}

function publicStorageBase(): string | null {
  const root = supabaseProjectUrl();
  if (!root) return null;
  return `${root}/storage/v1/object/public/${CONTENT_MEDIA_BUCKET}`;
}

function expandStoragePath(trimmed: string): string {
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//') || isLocalDeviceUri(trimmed)) {
    return trimmed;
  }

  const root = supabaseProjectUrl();
  const normalized = trimmed.replace(/^\/+/, '');

  if (root && normalized.startsWith('storage/v1/object/public/')) {
    return `${root}/${normalized}`;
  }

  if (root && normalized.startsWith(`${CONTENT_MEDIA_BUCKET}/`)) {
    return `${root}/storage/v1/object/public/${normalized}`;
  }

  const base = publicStorageBase();
  if (base && !normalized.includes('://')) {
    return `${base}/${normalized}`;
  }

  return trimmed;
}

function encodeSpaces(value: string): string {
  return value.includes(' ') ? value.replace(/ /g, '%20') : value;
}

/** iOS (ATS) exige HTTPS ; Supabase / Unsplash supportent les deux. */
export function preferHttpsUrl(url: string): string {
  if (url.toLowerCase().startsWith('http://')) {
    return `https://${url.slice(7)}`;
  }
  return url;
}

export function toHttpUrl(url: string): string | null {
  if (url.toLowerCase().startsWith('https://')) {
    return `http://${url.slice(8)}`;
  }
  return null;
}

/**
 * Variante Supabase Image Transform (JPEG côté serveur).
 * Corrige HEIC/WebP et Content-Type sur iOS.
 */
export function toSupabaseRenderUrl(url: string, width = 1200): string | null {
  try {
    const parsed = new URL(url);
    const idx = parsed.pathname.indexOf(SUPABASE_OBJECT_PREFIX);
    if (idx === -1) return null;
    const objectPath = parsed.pathname.slice(idx + SUPABASE_OBJECT_PREFIX.length);
    if (!objectPath) return null;
    return `${parsed.origin}/storage/v1/render/image/public/${objectPath}?width=${width}&quality=80`;
  } catch {
    return null;
  }
}

/** Normalise une URL distante ou locale pour l'affichage mobile. */
export function resolveRemoteImageUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isLocalDeviceUri(trimmed)) {
    return trimmed;
  }

  let url = expandStoragePath(trimmed);
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }

  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  return preferHttpsUrl(encodeSpaces(url));
}

export interface ResolveImageCandidatesOptions {
  /** Android seulement : retenter en HTTP si HTTPS échoue. */
  allowHttpFallback?: boolean;
  /** iOS : tenter d'abord Supabase render/image (spots, logos Storage). */
  useSupabaseRender?: boolean;
  renderWidth?: number;
}

/** Variantes de chargement — ordre optimisé par plateforme. */
export function resolveRemoteImageCandidates(
  raw: string | null | undefined,
  options: ResolveImageCandidatesOptions = {},
): string[] {
  const allowHttpFallback = options.allowHttpFallback ?? true;
  const primary = resolveRemoteImageUrl(raw);
  if (!primary) return [];
  if (isLocalDeviceUri(primary)) return [primary];

  const httpsUrl = preferHttpsUrl(primary);
  const candidates: string[] = [];

  // Prefer transform CDN (plus petit) avant l’original — réduit fortement l’egress Storage.
  if (options.useSupabaseRender) {
    const rendered = toSupabaseRenderUrl(httpsUrl, options.renderWidth ?? 800);
    if (rendered) candidates.push(rendered);
  }

  candidates.push(httpsUrl);

  if (allowHttpFallback) {
    const httpUrl = toHttpUrl(httpsUrl);
    if (httpUrl && httpUrl !== httpsUrl) {
      candidates.push(httpUrl);
    }
  }

  return [...new Set(candidates)];
}

export function resolveRemoteImageUrls(urls: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!urls?.length) return [];
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const raw of urls) {
    const url = resolveRemoteImageUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    resolved.push(url);
  }

  return resolved;
}
