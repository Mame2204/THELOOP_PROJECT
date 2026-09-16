/** Affichage mobile des textes légaux (plain text, lisible). */

const HTML_ENTITY: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeHtmlEntities(text: string): string {
  let out = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  out = out.replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITY[entity.toLowerCase()] ?? entity);
  return out;
}

/** Retire balises HTML / markdown léger pour lecture dans une modale texte. */
export function formatLegalBodyForDisplay(raw: string): string {
  if (!raw.trim()) return 'Contenu indisponible pour le moment. Contactez contact@theloop-app.com';

  let text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/li>\s*/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s+/gm, '');

  text = decodeHtmlEntities(text);
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || raw.trim();
}
