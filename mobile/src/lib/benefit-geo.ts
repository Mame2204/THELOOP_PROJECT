/**
 * Règles maillage géographique — octroi d'avantages (automatisations, octroi manuel, tirage).
 *
 * - Comparaison au niveau **préfecture** (ville) ; commune et quartier ignorés.
 * - **Zone / ville admin vide** → valable pour **tout le pays** (filtre catalogue + cible membres).
 * - **Avantage sans localisation** (catalogue ni spot lié) → **national / en ligne**, octroyé partout.
 */
import type { BenefitCatalogItem, BenefitOfferingPartner } from '@/lib/benefit-catalog-store';
import { peekContentSnapshot } from '@/lib/content-store';
import type { HomeLocation } from '@/lib/demo-data';
import {
  canonicalPrefectureLabel,
  formatLocationPrefectureLabel,
  locationsMatchPrefectureMesh,
  resolveGuineaPrefecture,
} from '@/lib/guinea-locations';

export interface BenefitGeoTarget {
  countryCode: string | null;
  locationLabel: string | null;
}

export interface BenefitGeoEntryLike {
  item: Pick<BenefitCatalogItem, 'id' | 'countryCode' | 'city'>;
  geoCountryCode?: string | null;
  geoLocationLabel?: string | null;
}

function geoLabelFromRaw(raw: string | null | undefined): string | null {
  return canonicalPrefectureLabel(raw);
}

function normalizeContentLocationLabel(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return geoLabelFromRaw(trimmed) ?? trimmed;
}

function geoFromSpotLocation(location: HomeLocation): BenefitGeoTarget {
  const candidates = [location.address, location.district].filter((value): value is string =>
    Boolean(value?.trim()),
  );

  for (const candidate of candidates) {
    const label = geoLabelFromRaw(candidate);
    if (label) {
      return {
        countryCode: location.countryCode ?? null,
        locationLabel: label,
      };
    }
  }

  return {
    countryCode: location.countryCode ?? null,
    locationLabel: normalizeContentLocationLabel(location.address) ?? location.district ?? null,
  };
}

/** Localisation effective d'un contenu publié (spot / outil / événement). */
export async function resolveContentGeoLocation(
  contentId: string,
  contentType?: BenefitOfferingPartner['contentType'] | null,
): Promise<BenefitGeoTarget | null> {
  const id = contentId.trim();
  if (!id) return null;

  const snapshot = await peekContentSnapshot();

  if (contentType === 'event') {
    const event = snapshot.events.find((e) => e.id === id);
    if (event) {
      return {
        countryCode: event.countryCode ?? null,
        locationLabel: normalizeContentLocationLabel(event.venueAddress),
      };
    }
  }

  if (contentType === 'spot' || contentType === 'tool') {
    const location = snapshot.locations.find((l) => l.id === id);
    if (location) return geoFromSpotLocation(location as HomeLocation);
  }

  if (!contentType) {
    const event = snapshot.events.find((e) => e.id === id);
    if (event) {
      return {
        countryCode: event.countryCode ?? null,
        locationLabel: normalizeContentLocationLabel(event.venueAddress),
      };
    }
    const location = snapshot.locations.find((l) => l.id === id);
    if (location) return geoFromSpotLocation(location as HomeLocation);
  }

  return null;
}

/** Geo effective : catalogue d'abord, sinon le spot/événement lié à l'offre partenaire. */
export async function resolveBenefitGeoFromOffering(
  item: Pick<BenefitCatalogItem, 'countryCode' | 'city'>,
  offering?: Pick<BenefitOfferingPartner, 'contentId' | 'contentType'> | null,
): Promise<BenefitGeoTarget> {
  if (item.city?.trim()) {
    return {
      countryCode: item.countryCode ?? null,
      locationLabel: geoLabelFromRaw(item.city.trim()) ?? item.city.trim(),
    };
  }

  if (offering?.contentId?.trim()) {
    const fromContent = await resolveContentGeoLocation(offering.contentId, offering.contentType ?? null);
    if (fromContent?.locationLabel?.trim()) {
      return {
        countryCode: fromContent.countryCode ?? item.countryCode ?? null,
        locationLabel: geoLabelFromRaw(fromContent.locationLabel) ?? fromContent.locationLabel.trim(),
      };
    }
  }

  return {
    countryCode: item.countryCode ?? null,
    locationLabel: null,
  };
}

export function geoTargetFromGrantableEntry(entry: BenefitGeoEntryLike): BenefitGeoTarget {
  return {
    countryCode: entry.geoCountryCode ?? entry.item.countryCode ?? null,
    locationLabel: entry.geoLocationLabel ?? entry.item.city ?? null,
  };
}

export function isNationwideBenefitGeo(geo: BenefitGeoTarget): boolean {
  return !geo.locationLabel?.trim();
}

export function benefitGeoMatchesUser(
  geo: BenefitGeoTarget,
  userCity?: string | null,
  countryCode?: string | null,
): boolean {
  if (countryCode && geo.countryCode && geo.countryCode !== countryCode) return false;
  if (!geo.locationLabel?.trim()) return true;
  if (!userCity?.trim()) return false;
  return locationsMatchPrefectureMesh(userCity, geo.locationLabel);
}

export function benefitGeoMatchesJobZone(
  geo: BenefitGeoTarget,
  job: { countryCode: string; city?: string | null },
): boolean {
  if (geo.countryCode && geo.countryCode !== job.countryCode) return false;
  if (!job.city?.trim()) return true;
  if (!geo.locationLabel?.trim()) return true;
  return locationsMatchPrefectureMesh(geo.locationLabel, job.city);
}

export function benefitGeoMatchesJobUser(
  geo: BenefitGeoTarget,
  job: { countryCode: string; city?: string | null },
  userCity?: string | null,
): boolean {
  if (geo.countryCode && geo.countryCode !== job.countryCode) return false;
  if (job.city?.trim()) {
    if (!userCity?.trim() || !locationsMatchPrefectureMesh(userCity, job.city)) return false;
  }
  if (!geo.locationLabel?.trim()) return true;
  if (!userCity?.trim()) return false;
  return locationsMatchPrefectureMesh(userCity, geo.locationLabel);
}

export function formatBenefitGeoLabel(geo: BenefitGeoTarget): string {
  if (!geo.locationLabel?.trim()) return 'Tout le pays / en ligne';
  const prefecture = formatLocationPrefectureLabel(geo.locationLabel);
  if (prefecture) return prefecture;
  const resolved = resolveGuineaPrefecture(geo.locationLabel);
  return resolved ? formatLocationPrefectureLabel(resolved) : geo.locationLabel.trim();
}

export function formatGrantableBenefitGeoLabel(
  item: BenefitCatalogItem,
  offerings: BenefitGeoEntryLike[],
): string {
  if (item.city?.trim()) {
    return formatBenefitGeoLabel({ countryCode: item.countryCode ?? null, locationLabel: item.city });
  }

  const related = offerings.filter((o) => o.item.id === item.id);
  if (!related.length) return 'Tout le pays / en ligne';

  const prefectures = new Set<string>();
  let hasNationwide = false;

  for (const entry of related) {
    const geo = geoTargetFromGrantableEntry(entry);
    if (isNationwideBenefitGeo(geo)) {
      hasNationwide = true;
      continue;
    }
    prefectures.add(formatBenefitGeoLabel(geo));
  }

  if (prefectures.size === 0) return 'Tout le pays / en ligne';
  if (prefectures.size === 1) return [...prefectures][0];
  if (hasNationwide) return 'Plusieurs zones · dont national';
  return 'Plusieurs préfectures';
}

export function formatGrantableEntryGeoLabel(entry: BenefitGeoEntryLike): string {
  return formatBenefitGeoLabel(geoTargetFromGrantableEntry(entry));
}
