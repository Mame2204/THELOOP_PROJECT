import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'src/data/guinea-locations.json');
const outPath = path.join(root, '..', 'supabase', 'scripts', 'seed_guinea_locations.sql');

const BATCH = 200;

function esc(value) {
  return String(value ?? '').replace(/'/g, "''");
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const header = `-- =============================================================================
-- THE LOOP — Seed localisations Guinée (région → préfecture → commune → quartier)
-- Source : mobile/src/data/guinea-locations.json (${data.length} entrées)
-- Idempotent — exécuter dans Supabase SQL Editor
-- =============================================================================

TRUNCATE TABLE public.guinea_locations RESTART IDENTITY;

`;

const batches = [];
for (let i = 0; i < data.length; i += BATCH) {
  const chunk = data.slice(i, i + BATCH);
  const values = chunk
    .map(
      (row) =>
        `  ('${esc(row.region)}', '${esc(row.prefecture)}', '${esc(row.commune)}', '${esc(row.district)}', 'GN')`,
    )
    .join(',\n');
  batches.push(
    `INSERT INTO public.guinea_locations (region, prefecture, commune, district, country_code)\nVALUES\n${values}\nON CONFLICT (region, prefecture, commune, district) DO NOTHING;`,
  );
}

const footer = `
SELECT count(*) AS guinea_locations_rows FROM public.guinea_locations;
SELECT region, prefecture, commune, district
FROM public.guinea_locations
ORDER BY region, prefecture, commune, district
LIMIT 5;
`;

fs.writeFileSync(outPath, header + batches.join('\n\n') + footer);
console.log(`OK: ${outPath} (${data.length} entrées, ${batches.length} lots)`);
