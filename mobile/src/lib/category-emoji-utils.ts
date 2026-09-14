const FALLBACK_EMOJI = '🏷️';

/** Extrait le premier grapheme emoji (supporte drapeaux, tons de peau, ZWJ). */
export function normalizeCategoryEmoji(
  raw: string | null | undefined,
  fallback: string = FALLBACK_EMOJI,
): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback;

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const first = [...segmenter.segment(trimmed)][0]?.segment?.trim();
    if (first) return first;
  }

  const chars = [...trimmed];
  if (chars.length === 0) return fallback;

  let result = chars[0];
  let i = 1;
  while (i < chars.length && /[\uFE0E\uFE0F]/.test(chars[i])) {
    result += chars[i++];
  }
  if (i < chars.length && /[\u{1F3FB}-\u{1F3FF}]/u.test(chars[i])) {
    result += chars[i++];
  }
  if (i < chars.length && /[\u{1F1E6}-\u{1F1FF}]/u.test(chars[i])) {
    result += chars[i++];
  }

  return result || fallback;
}
