import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loopMarkInner } from './loop-mark-svg.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Ajoute ou corrige le point sur toutes les marques inline. */
function patchContent(html) {
  let n = 0;
  const out = html.replace(
    /<svg([^>]*viewBox="0 0 36 36"[^>]*)>([\s\S]*?)<\/svg>/gi,
    (full, svgAttrs, inner) => {
      if (!inner.includes('13.5 10.21')) return full;
      const strokeMatch = inner.match(
        /<path d="M 13\.5 10\.21 A 9 9 0 1 1 13\.5 25\.79" stroke="([^"]+)" stroke-width="([23])"/,
      );
      if (!strokeMatch) return full;
      const color = strokeMatch[1];
      const sw = Number(strokeMatch[2]);
      const dotR = sw <= 2 ? 2.75 : 3.5;
      const mark = loopMarkInner({ color, strokeWidth: sw, dotR });
      n += 1;
      return `<svg${svgAttrs}>${mark}</svg>`;
    },
  );
  return { out, n };
}

const files = fs.readdirSync(root).filter((f) => f.startsWith('export-visuels') && f.endsWith('.html'));
let total = 0;
for (const f of files) {
  const p = path.join(root, f);
  const raw = fs.readFileSync(p, 'utf8');
  const { out, n } = patchContent(raw);
  if (n > 0) {
    fs.writeFileSync(p, out);
    console.log(f, '→', n, 'logo(s)');
    total += n;
  }
}
console.log('Total logos patched:', total);
