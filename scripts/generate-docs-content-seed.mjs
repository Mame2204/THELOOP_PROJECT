/**
 * Génère supabase/migrations/20260883_docs_content_seed.sql
 * depuis DocumentationsTheLoop/content/*.csv
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'DocumentationsTheLoop', 'content');
const OUT = path.join(ROOT, 'supabase', 'migrations', '20260883_docs_content_seed.sql');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim().length > 0));
}

function dollarQuote(s) {
  let tag = 'content';
  let n = 0;
  while (s.includes(`$${tag}$`)) {
    n += 1;
    tag = `content${n}`;
  }
  return `$${tag}$${s}$${tag}$`;
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

const legalKeyMap = {
  politique_confidentialite: 'privacy_policy',
  cgu: 'cgu',
  partner_terms: 'partner_terms',
  mentions_legales: 'mentions_legales',
  conditions_pass_prime: 'conditions_pass_prime',
  politique_cookies: 'politique_cookies',
};

const pagesRows = parseCsv(fs.readFileSync(path.join(CONTENT, 'pages.csv'), 'utf8'));
const legalRows = parseCsv(fs.readFileSync(path.join(CONTENT, 'legal.csv'), 'utf8'));
const faqRows = parseCsv(fs.readFileSync(path.join(CONTENT, 'faq.csv'), 'utf8'));

const pages = pagesRows.slice(1).map((r) => ({
  key: r[0],
  title: r[1],
  body: r[2],
  updatedAt: r[3] || new Date().toISOString(),
}));

const legal = legalRows.slice(1).map((r) => ({
  key: legalKeyMap[r[0]] || r[0],
  title: r[1],
  body: r[2],
  updatedAt: r[3] || new Date().toISOString(),
}));

const faq = faqRows.slice(1).map((r) => ({
  id: r[0],
  question: r[1],
  answer: r[2],
  category: r[3] || 'general',
  displayOrder: Number(r[4] || 0),
  isActive: String(r[5]).toLowerCase() !== 'false',
  updatedAt: r[6] || new Date().toISOString(),
}));

let sql = `-- Contenu éditorial DocumentationsTheLoop/content → tables app_*
-- Généré par scripts/generate-docs-content-seed.mjs — régénérer plutôt que d'éditer à la main.

-- ── Pages informatives (À propos, Comment ça marche, …) ─────────────────────
CREATE TABLE IF NOT EXISTS public.app_content_pages (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_content_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read content pages" ON public.app_content_pages;
CREATE POLICY "Public read content pages"
  ON public.app_content_pages FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manage content pages" ON public.app_content_pages;
CREATE POLICY "Admin manage content pages"
  ON public.app_content_pages FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── FAQ ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_faq (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_faq_active_order
  ON public.app_faq (is_active, display_order);

ALTER TABLE public.app_faq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active faq" ON public.app_faq;
CREATE POLICY "Public read active faq"
  ON public.app_faq FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin manage faq" ON public.app_faq;
CREATE POLICY "Admin manage faq"
  ON public.app_faq FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.app_legal_content IS
  'Textes légaux : cgu, privacy_policy, partner_terms, mentions_legales, conditions_pass_prime, politique_cookies';

`;

for (const p of pages) {
  sql += `
INSERT INTO public.app_content_pages (key, title, body, updated_at)
VALUES (${sqlStr(p.key)}, ${sqlStr(p.title)}, ${dollarQuote(p.body)}, ${sqlStr(p.updatedAt)}::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;
`;
}

for (const l of legal) {
  sql += `
INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES (${sqlStr(l.key)}, ${sqlStr(l.title)}, ${dollarQuote(l.body)}, ${sqlStr(l.updatedAt)}::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;
`;
}

for (const f of faq) {
  sql += `
INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  ${sqlStr(f.id)},
  ${sqlStr(f.question)},
  ${dollarQuote(f.answer)},
  ${sqlStr(f.category)},
  ${f.displayOrder},
  ${f.isActive},
  ${sqlStr(f.updatedAt)}::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;
`;
}

fs.writeFileSync(OUT, sql, 'utf8');
console.log('Wrote', OUT);
console.log('pages', pages.length, 'legal', legal.length, 'faq', faq.length);
