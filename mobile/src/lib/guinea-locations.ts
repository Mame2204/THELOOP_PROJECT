import { GUINEA_LOCATIONS, type GuineaLocationEntry } from '../data/guinea-locations-data';

export type { GuineaLocationEntry };

/** Hiérarchie géographique GN sélectionnée (référentiel guinea_locations). */
export interface GuineaLocationSnapshot {
  region: string;
  prefecture: string;
  commune: string;
  district: string | null;
  countryCode: string;
  label: string;
}

/** Métadonnées remontées par le picker (sans country / label). */
export interface GuineaLocationPickMeta {
  region: string;
  prefecture: string;
  commune: string;
  district: string | null;
}

const ENTRIES = GUINEA_LOCATIONS;

/** Libellé canonique stocké en base : `COMMUNE · QUARTIER` ou commune seule. */
export function formatGuineaLocation(commune: string, district?: string | null): string {
  const c = commune.trim();
  const d = district?.trim();
  if (!d) return c;
  return `${c} · ${d}`;
}

const LOCATION_SEP = ' · ';

/** Décompose un libellé `COMMUNE · QUARTIER` (ou commune seule). */
export function parseGuineaLocationLabel(value: string): { commune: string; district: string | null } {
  const trimmed = value.trim();
  const idx = trimmed.indexOf(LOCATION_SEP);
  if (idx < 0) return { commune: trimmed, district: null };
  return {
    commune: trimmed.slice(0, idx).trim(),
    district: trimmed.slice(idx + LOCATION_SEP.length).trim() || null,
  };
}

/** Quartier enregistré sur un spot (quartier si présent, sinon commune). */
export function spotDistrictFromGuineaLabel(value: string): string | null {
  const { commune, district } = parseGuineaLocationLabel(value);
  return (district ?? commune) || null;
}

let districtIndexBuilt = false;
const districtNameToEntries = new Map<string, GuineaLocationEntry[]>();

function buildDistrictIndex(): void {
  if (districtIndexBuilt) return;
  districtIndexBuilt = true;
  for (const entry of ENTRIES) {
    const key = normalizeLocationLabel(entry.district);
    const list = districtNameToEntries.get(key) ?? [];
    list.push(entry);
    districtNameToEntries.set(key, list);
  }
}

function findGuineaEntryByDistrict(district: string, hint?: string | null): GuineaLocationEntry | null {
  buildDistrictIndex();
  const key = normalizeLocationLabel(district);
  const candidates = districtNameToEntries.get(key) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (hint) {
    const hintKey = normalizeLocationLabel(hint);
    const filtered = candidates.filter(
      (e) =>
        normalizeLocationLabel(e.prefecture) === hintKey ||
        normalizeLocationLabel(e.commune) === hintKey ||
        normalizeLocationLabel(e.region) === hintKey,
    );
    if (filtered.length >= 1) return filtered[0];
  }
  return candidates[0];
}

function findGuineaEntryByCommune(commune: string): GuineaLocationEntry | null {
  const key = normalizeLocationLabel(commune);
  return ENTRIES.find((e) => normalizeLocationLabel(e.commune) === key) ?? null;
}

/**
 * Normalise un libellé stocké (legacy `quartier, ville`, champs address/district séparés,
 * ou `COMMUNE · QUARTIER`) vers le format attendu par le picker.
 */
export function canonicalizeGuineaLocationLabel(
  address: string | null | undefined,
  district?: string | null,
): string {
  const raw = (address ?? '').trim();
  const distCol = (district ?? '').trim();

  if (!raw && !distCol) return '';

  if (raw.includes(LOCATION_SEP)) {
    const { commune, district: d } = parseGuineaLocationLabel(raw);
    if (d) {
      const entry = findGuineaEntryByDistrict(d, commune);
      if (entry) return formatGuineaLocation(entry.commune, entry.district);
    }
    if (commune) {
      const entry = findGuineaEntryByCommune(commune);
      if (entry && !d) return entry.commune;
    }
    return raw;
  }

  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const quartier = parts[0];
      const cityHint = parts[parts.length - 1];
      const entry = findGuineaEntryByDistrict(quartier, cityHint);
      if (entry) return formatGuineaLocation(entry.commune, entry.district);
    }
  }

  if (distCol) {
    const entry = findGuineaEntryByDistrict(distCol, raw || null);
    if (entry) return formatGuineaLocation(entry.commune, entry.district);
  }

  if (raw) {
    const byDistrict = findGuineaEntryByDistrict(raw);
    if (byDistrict) return formatGuineaLocation(byDistrict.commune, byDistrict.district);
    const byCommune = findGuineaEntryByCommune(raw);
    if (byCommune) return byCommune.commune;
  }

  if (distCol && raw) {
    return formatGuineaLocation(raw, distCol);
  }

  return raw || distCol;
}

/** Libellé carte / liste : commune · quartier (ou commune seule). */
export function formatCommuneDistrictDisplay(
  value: string | null | undefined,
  district?: string | null,
): string | null {
  const canonical = canonicalizeGuineaLocationLabel(value, district);
  return canonical || null;
}

/** Valeur initiale du picker spot à partir des champs legacy address/district. */
export function normalizeSpotLocationPickerValue(
  address: string | null | undefined,
  district: string | null | undefined,
): string {
  return canonicalizeGuineaLocationLabel(address, district);
}

export function normalizeLocationLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function formatPrefectureDisplay(prefecture: string): string {
  return prefecture
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

let prefectureIndexBuilt = false;
const prefectureNameKeys = new Set<string>();
const communeToPrefecture = new Map<string, string>();
const communeDistrictToPrefecture = new Map<string, string>();
const districtToPrefecture = new Map<string, string>();

function buildPrefectureIndex(): void {
  if (prefectureIndexBuilt) return;
  prefectureIndexBuilt = true;
  for (const entry of ENTRIES) {
    prefectureNameKeys.add(normalizeLocationLabel(entry.prefecture));
    const communeKey = normalizeLocationLabel(entry.commune);
    if (!communeToPrefecture.has(communeKey)) {
      communeToPrefecture.set(communeKey, entry.prefecture);
    }
    communeDistrictToPrefecture.set(
      `${communeKey}::${normalizeLocationLabel(entry.district)}`,
      entry.prefecture,
    );
    districtToPrefecture.set(normalizeLocationLabel(entry.district), entry.prefecture);
  }
}

function resolveGuineaPrefectureOnce(trimmed: string): string | null {
  buildPrefectureIndex();

  const wholeKey = normalizeLocationLabel(trimmed);
  if (prefectureNameKeys.has(wholeKey)) {
    const match = ENTRIES.find((e) => normalizeLocationLabel(e.prefecture) === wholeKey);
    return match?.prefecture ?? null;
  }

  const { commune, district } = parseGuineaLocationLabel(trimmed);
  const communeKey = normalizeLocationLabel(commune);
  if (!communeKey) return null;

  if (district) {
    const byPair = communeDistrictToPrefecture.get(`${communeKey}::${normalizeLocationLabel(district)}`);
    if (byPair) return byPair;
  }

  const byCommune = communeToPrefecture.get(communeKey);
  if (byCommune) return byCommune;

  // Quartier seul (ex. CAMAYENNE — souvent stocké sur les spots)
  const byQuartier = districtToPrefecture.get(communeKey);
  if (byQuartier) return byQuartier;

  return null;
}

/** Résout la préfecture (ville) à partir d'un libellé stocké commune · quartier. */
export function resolveGuineaPrefecture(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  const direct = resolveGuineaPrefectureOnce(trimmed);
  if (direct) return direct;

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const found = resolveGuineaPrefectureOnce(part);
      if (found) return found;
    }
  }

  return null;
}

/** Normalise un libellé geo vers la préfecture canonique (matching avantages). */
export function canonicalPrefectureLabel(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  return resolveGuineaPrefecture(trimmed) ?? trimmed;
}

/** Clé normalisée préfecture — maillage avantages au niveau ville (préfecture). */
export function locationPrefectureKey(value: string | null | undefined): string {
  const prefecture = resolveGuineaPrefecture(value);
  if (prefecture) return normalizeLocationLabel(prefecture);
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return normalizeLocationLabel(parseGuineaLocationLabel(trimmed).commune);
}

/** @deprecated Alias — utiliser locationPrefectureKey */
export const locationCommuneKey = locationPrefectureKey;

/** Libellé affiché au maillage ville (préfecture). */
export function formatLocationPrefectureLabel(value: string | null | undefined): string {
  const prefecture = resolveGuineaPrefecture(value);
  if (prefecture) return formatPrefectureDisplay(prefecture);
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return parseGuineaLocationLabel(trimmed).commune.trim();
}

/** @deprecated Alias — utiliser formatLocationPrefectureLabel */
export const formatLocationCityMeshLabel = formatLocationPrefectureLabel;

/**
 * Compare au maillage ville (préfecture) — commune et quartier ignorés
 * même si profil / avantage / zone enregistrent `COMMUNE · QUARTIER`.
 */
export function locationsMatchPrefectureMesh(
  userLocation: string | null | undefined,
  targetLocation: string | null | undefined,
): boolean {
  const targetPrefecture = locationPrefectureKey(targetLocation);
  if (!targetPrefecture) return true;
  const userPrefecture = locationPrefectureKey(userLocation);
  if (!userPrefecture) return false;
  return userPrefecture === targetPrefecture;
}

/** @deprecated Alias — utiliser locationsMatchPrefectureMesh */
export const locationsMatchCityMesh = locationsMatchPrefectureMesh;

/** Compare ville compte / ville cible — exact ou commune englobante (legacy fin). */
export function locationsMatch(
  userLocation: string | null | undefined,
  targetLocation: string | null | undefined,
): boolean {
  const u = normalizeLocationLabel(userLocation);
  const t = normalizeLocationLabel(targetLocation);
  if (!t) return true;
  if (!u) return false;
  if (u === t) return true;
  const sep = ' · ';
  if (!t.includes(sep) && u.startsWith(t + sep)) return true;
  if (!u.includes(sep) && t.startsWith(u + sep)) return true;
  return false;
}

export function listGuineaRegions(): string[] {
  return [...new Set(ENTRIES.map((e) => e.region))].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function listGuineaPrefectures(region: string): string[] {
  return [...new Set(ENTRIES.filter((e) => e.region === region).map((e) => e.prefecture))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
}

export function listGuineaCommunes(region: string, prefecture: string): string[] {
  return [...new Set(ENTRIES.filter((e) => e.region === region && e.prefecture === prefecture).map((e) => e.commune))].sort(
    (a, b) => a.localeCompare(b, 'fr'),
  );
}

export function listGuineaDistricts(region: string, prefecture: string, commune: string): string[] {
  return ENTRIES.filter((e) => e.region === region && e.prefecture === prefecture && e.commune === commune)
    .map((e) => e.district)
    .sort((a, b) => a.localeCompare(b, 'fr'));
}

export function searchGuineaLocations(query: string, limit = 40): GuineaLocationEntry[] {
  const q = normalizeLocationLabel(query);
  if (!q || q.length < 2) return [];
  return ENTRIES.filter((e) => {
    const label = normalizeLocationLabel(formatGuineaLocation(e.commune, e.district));
    return (
      label.includes(q) ||
      normalizeLocationLabel(e.commune).includes(q) ||
      normalizeLocationLabel(e.district).includes(q) ||
      normalizeLocationLabel(e.prefecture).includes(q)
    );
  }).slice(0, limit);
}

export function isGuineaCountry(countryCode?: string | null): boolean {
  return (countryCode ?? 'GN').toUpperCase() === 'GN';
}

/** Retrouve une entrée du référentiel à partir du libellé picker. */
export function resolveGuineaEntryFromLabel(label: string): GuineaLocationEntry | null {
  const canonical = canonicalizeGuineaLocationLabel(label);
  if (!canonical) return null;

  const { commune, district } = parseGuineaLocationLabel(canonical);
  if (district) {
    return findGuineaEntryByDistrict(district, commune);
  }
  return findGuineaEntryByCommune(commune);
}

export function toGuineaLocationSnapshot(
  meta: GuineaLocationPickMeta,
  label: string,
  countryCode = 'GN',
): GuineaLocationSnapshot {
  return {
    region: meta.region,
    prefecture: meta.prefecture,
    commune: meta.commune,
    district: meta.district,
    countryCode,
    label: label.trim(),
  };
}

export function guineaLocationSnapshotFromLabel(
  label: string,
  countryCode = 'GN',
): GuineaLocationSnapshot | null {
  const entry = resolveGuineaEntryFromLabel(label);
  if (!entry) return null;

  const { district } = parseGuineaLocationLabel(label);
  return {
    region: entry.region,
    prefecture: entry.prefecture,
    commune: entry.commune,
    district: district ?? entry.district ?? null,
    countryCode,
    label: canonicalizeGuineaLocationLabel(label) || label.trim(),
  };
}

export function guineaLocationSnapshotFromStored(
  raw: unknown,
  countryCode = 'GN',
): GuineaLocationSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const commune = String(row.commune ?? '').trim();
  if (!commune) return null;

  const districtRaw = row.district;
  const district = districtRaw == null || String(districtRaw).trim() === ''
    ? null
    : String(districtRaw).trim();

  const label = String(row.label ?? '').trim() || formatGuineaLocation(commune, district);

  return {
    region: String(row.region ?? '').trim(),
    prefecture: String(row.prefecture ?? '').trim(),
    commune,
    district,
    countryCode: String(row.countryCode ?? row.country_code ?? countryCode).trim() || countryCode,
    label,
  };
}

/** True si le libellé correspond à une commune/quartier du référentiel GN. */
export function isRecognizedGuineaLocationLabel(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return false;

  buildPrefectureIndex();
  buildDistrictIndex();

  const canonical = canonicalizeGuineaLocationLabel(trimmed);
  if (!canonical) return false;

  const { commune, district } = parseGuineaLocationLabel(canonical);
  const communeKey = normalizeLocationLabel(commune);
  if (!communeKey) return false;

  if (district) {
    return communeDistrictToPrefecture.has(`${communeKey}::${normalizeLocationLabel(district)}`);
  }

  return communeToPrefecture.has(communeKey);
}

/**
 * Valeur sûre pour le picker à l'ouverture du formulaire :
 * vide si le texte est le nom du lieu/salle, sinon canonicalise le référentiel GN.
 */
export function sanitizePhysicalLocationInput(
  address: string | null | undefined,
  district?: string | null,
  excludeLabel?: string | null,
): string {
  const canonical = canonicalizeGuineaLocationLabel(address, district);
  if (!canonical) return '';

  const excluded = (excludeLabel ?? '').trim();
  if (excluded && canonical.toLowerCase() === excluded.toLowerCase()) {
    return '';
  }

  if (!isRecognizedGuineaLocationLabel(canonical)) {
    return '';
  }

  return canonical;
}

/** Normalise une sélection picker avant enregistrement. */
export function normalizePhysicalLocationForSave(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  return canonicalizeGuineaLocationLabel(trimmed) || trimmed;
}
