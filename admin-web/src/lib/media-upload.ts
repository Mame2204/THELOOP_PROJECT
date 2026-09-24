import { supabase } from './supabase';

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1] || 'image/jpeg';
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { mime, bytes };
  } catch {
    return null;
  }
}

function extensionForMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * Enregistre les logos Accueil en URL publique (Storage) — les data URLs ne se propagent pas bien sur mobile.
 */
export async function ensurePublicAccueilImageUrl(url: string): Promise<{ url: string; error?: string }> {
  const trimmed = url.trim();
  if (!trimmed) return { url: trimmed };
  if (!trimmed.startsWith('data:')) return { url: trimmed };

  const parsed = parseDataUrl(trimmed);
  if (!parsed) return { url: trimmed, error: 'Image locale illisible.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const owner = user?.id ?? 'admin-web';
  const ext = extensionForMime(parsed.mime);
  const path = `accueil-logos/${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from('content-media').upload(path, parsed.bytes, {
    contentType: parsed.mime,
    upsert: false,
  });
  if (error) return { url: trimmed, error: error.message };

  const { data } = supabase.storage.from('content-media').getPublicUrl(path);
  return { url: data.publicUrl };
}
