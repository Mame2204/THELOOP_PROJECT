/**
 * Compare le poids reel de la requete catalogue de l'application avec une
 * variante allegee qui ne demande que ce qu'une liste affiche.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function loadEnvFile(relPath) {
  const path = resolve(root, relPath);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const mobileEnv = loadEnvFile('mobile/.env');
const serverEnv = loadEnvFile('server/.env');
const SUPABASE_URL = mobileEnv.EXPO_PUBLIC_SUPABASE_URL || serverEnv.SUPABASE_URL;
const SERVICE_KEY = serverEnv.SUPABASE_SERVICE_ROLE_KEY;

const EVENT_FULL = `id,title,description,banner_url,fallback_color,organizer_id,master_id,organizer_name,content_origin,is_external_location,establishment_id,custom_location_name,location_id,start_date,end_date,is_free,is_invitation_only,ticket_price,action_link,website_url,instagram_url,facebook_url,is_loop_x,reveal_price,is_featured,featured_end_date,country_code,category_slugs,content_status,is_active,created_at,click_count,favorite_count,gallery_images,locations(id,neighborhood_name,city,country),establishments(id,name),event_speakers(id,full_name,professional_title,company_name,photo_url),event_schedules(id,time_label,activity_title,order_index)`;

const EVENT_LIST = `id,title,banner_url,fallback_color,start_date,end_date,is_free,ticket_price,reveal_price,is_loop_x,is_featured,featured_end_date,country_code,category_slugs,content_status,is_active,click_count,favorite_count,establishment_id,custom_location_name,locations(id,neighborhood_name,city,country),establishments(id,name)`;

const ESTAB_FULL = `id,name,description,price_indicator,phone_contact,action_link,website_url,instagram_url,facebook_url,latitude,longitude,location_id,is_active,country_code,content_origin,content_status,click_count,favorite_count,engagement_score,star_count,stars_source,admin_star_override,rating_avg,rating_count,category_slugs,opening_hours_label,is_featured,featured_end_date,created_at,locations(id,neighborhood_name,city,country),establishment_photos(id,photo_url,is_primary),establishment_schedules(id,day_of_week,opening_time,closing_time,is_closed)`;

const ESTAB_LIST = `id,name,price_indicator,latitude,longitude,is_active,country_code,content_status,click_count,favorite_count,engagement_score,star_count,rating_avg,rating_count,category_slugs,is_featured,featured_end_date,locations(id,neighborhood_name,city,country),establishment_photos(id,photo_url,is_primary)`;

const ko = (b) => `${(b / 1024).toFixed(1)} Ko`;

async function weigh(table, select) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const text = await res.text();
  if (!res.ok) return { bytes: 0, rows: 0, error: text.slice(0, 200) };
  const parsed = JSON.parse(text);
  return { bytes: Buffer.byteLength(text, 'utf8'), rows: parsed.length };
}

function line(label, r) {
  if (r.error) return console.log(`${label.padEnd(30)} erreur : ${r.error}`);
  const perRow = r.rows ? r.bytes / r.rows : 0;
  console.log(
    `${label.padEnd(30)} ${ko(r.bytes).padStart(9)}  ${String(r.rows).padStart(3)} lignes  ${(perRow / 1024).toFixed(2)} Ko/ligne`,
  );
}

console.log('=== Poids reel de la requete catalogue ===\n');

const eFull = await weigh('events', EVENT_FULL);
const eList = await weigh('events', EVENT_LIST);
const sFull = await weigh('establishments', ESTAB_FULL);
const sList = await weigh('establishments', ESTAB_LIST);

line('evenements, requete actuelle', eFull);
line('evenements, variante liste', eList);
line('lieux, requete actuelle', sFull);
line('lieux, variante liste', sList);

const totalFull = eFull.bytes + sFull.bytes;
const totalList = eList.bytes + sList.bytes;
const gain = totalFull ? 100 - (totalList / totalFull) * 100 : 0;

console.log(`\nActuel   : ${ko(totalFull)}`);
console.log(`Allege   : ${ko(totalList)}  (-${gain.toFixed(0)} %)`);

const perRowFull = (eFull.rows + sFull.rows) ? totalFull / (eFull.rows + sFull.rows) : 0;
const perRowList = (eList.rows + sList.rows) ? totalList / (eList.rows + sList.rows) : 0;

console.log('\n=== Projection a volume de contenu realiste ===');
for (const n of [50, 200, 500]) {
  console.log(
    `${String(n).padStart(3)} fiches : actuel ${ko(perRowFull * n).padStart(9)}  -> allege ${ko(perRowList * n).padStart(9)}`,
  );
}
