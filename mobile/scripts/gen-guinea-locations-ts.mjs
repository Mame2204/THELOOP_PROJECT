import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'src/data/guinea-locations.json');
const outPath = path.join(root, 'src/data/guinea-locations-data.ts');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const header = `// Données locales Guinée — généré depuis guinea-locations.json
export interface GuineaLocationEntry {
  region: string;
  prefecture: string;
  commune: string;
  district: string;
}

export const GUINEA_LOCATIONS: GuineaLocationEntry[] = `;

fs.writeFileSync(outPath, `${header}${JSON.stringify(data)};\n`);
console.log(`OK: ${outPath} (${data.length} entrées)`);
