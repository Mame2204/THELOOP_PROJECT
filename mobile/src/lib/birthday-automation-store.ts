import AsyncStorage from '@react-native-async-storage/async-storage';
import { listAutomationGrantableCatalog } from '@/lib/admin-automation-benefits';
import {
  benefitGeoMatchesJobUser,
  geoTargetFromGrantableEntry,
} from '@/lib/benefit-geo';
import { listBenefitCatalog } from '@/lib/benefit-catalog-store';
import { locationsMatchPrefectureMesh } from '@/lib/guinea-locations';
import { grantPrimeBenefits } from '@/lib/prime-benefits-store';
import { distributeNotification } from '@/lib/user-notifications-store';
import { listRegistryUsers } from '@/lib/user-registry-store';

const LOG_KEY = 'loop_birthday_grant_log_v1';

interface BirthdayGrantLog {
  userId: string;
  year: number;
  kind: 'city_benefit' | 'generic_benefit' | 'discovery_message';
  grantedAt: string;
}

async function loadLog(): Promise<BirthdayGrantLog[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BirthdayGrantLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLog(entries: BirthdayGrantLog[]): Promise<void> {
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

function isBirthdayToday(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
}

/** Traite les anniversaires du jour — avantage ville ou fallback générique / message Outils. */
export async function processBirthdayAutomationForDate(
  date = new Date(),
  countryCode?: string,
  cityFilter?: string | null,
): Promise<number> {
  const users = await listRegistryUsers();
  const catalog = await listBenefitCatalog(true);
  const genericCatalog = catalog.filter((c) => c.benefitPurpose === 'generic_fallback' && c.isActive);
  const log = await loadLog();
  const year = date.getFullYear();
  let processed = 0;

  for (const user of users) {
    if (!isBirthdayToday(user.birthDate)) continue;
    if (countryCode && user.countryCode && user.countryCode !== countryCode) continue;
    if (cityFilter?.trim() && !locationsMatchPrefectureMesh(user.city, cityFilter)) continue;
    if (log.some((e) => e.userId === user.id && e.year === year)) continue;

    const userCountry = user.countryCode ?? countryCode ?? 'GN';
    const userCity = user.city ?? null;
    const grantable = await listAutomationGrantableCatalog({
      countryCode: userCountry,
      benefitPurpose: 'birthday',
      job: { countryCode: userCountry, city: cityFilter?.trim() || null },
    });
    const matchingEntries = grantable.filter((entry) =>
      benefitGeoMatchesJobUser(geoTargetFromGrantableEntry(entry), { countryCode: userCountry, city: null }, userCity),
    );
    const partnerByCatalogId: Record<string, string> = {};
    const partnerDisplayNameByCatalogId: Record<string, string> = {};
    for (const entry of matchingEntries) {
      if (partnerByCatalogId[entry.item.id]) continue;
      partnerByCatalogId[entry.item.id] = entry.partnerId;
      partnerDisplayNameByCatalogId[entry.item.id] = entry.partnerDisplayName;
    }
    const cityBenefitIds = Object.keys(partnerByCatalogId);

    if (cityBenefitIds.length > 0) {
      const expiresAt = new Date(date);
      expiresAt.setDate(expiresAt.getDate() + 30);
      await grantPrimeBenefits({
        catalogIds: cityBenefitIds,
        partnerByCatalogId,
        partnerDisplayNameByCatalogId,
        audience: 'individual',
        targetPhones: user.phoneNumber ?? undefined,
        expiresAt: expiresAt.toISOString(),
        grantedBy: 'birthday-automation',
        grantCountryCode: userCountry,
        grantCity: userCity,
      });
      log.push({ userId: user.id, year, kind: 'city_benefit', grantedAt: date.toISOString() });
      processed += 1;
      continue;
    }

    if (genericCatalog.length > 0) {
      const expiresAt = new Date(date);
      expiresAt.setDate(expiresAt.getDate() + 30);
      await grantPrimeBenefits({
        catalogIds: [genericCatalog[0].id],
        partnerByCatalogId: {},
        audience: 'individual',
        targetPhones: user.phoneNumber ?? undefined,
        expiresAt: expiresAt.toISOString(),
        grantedBy: 'birthday-automation',
        grantCountryCode: userCountry,
      });
      log.push({ userId: user.id, year, kind: 'generic_benefit', grantedAt: date.toISOString() });
      processed += 1;
      continue;
    }

    if (user.phoneNumber) {
      await distributeNotification({
        title: 'Joyeux anniversaire ! 🎂',
        message:
          'On n\'est pas encore très présents dans ta ville, mais on arrive bientôt. ' +
          'En attendant, découvre notre section Outils !',
        audience: 'individual',
        targetPhone: user.phoneNumber,
      });
      log.push({ userId: user.id, year, kind: 'discovery_message', grantedAt: date.toISOString() });
      processed += 1;
    }
  }

  await saveLog(log);
  return processed;
}
