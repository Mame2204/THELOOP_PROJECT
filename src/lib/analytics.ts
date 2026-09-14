import type { AnalyticsContentOption, AnalyticsPartnerOption, AnalyticsSnapshot } from '@/types/admin';
import type { EventCategory } from '@/types';
import { EVENT_ORGANIZERS, getHomeLocations, getPublicEvents } from '@/lib/demo-data';
import { loadAdminStore } from '@/lib/admin-store';

const CATEGORY_KEYS = ['corporate', 'nightlife', 'art_culture', 'gastronomie'] as const;

function estimateImpressions(clicks: number, seed: number): number {
  const rate = 0.12 + (seed % 7) * 0.015;
  return Math.max(clicks, Math.round(clicks / rate));
}

export function getAnalyticsPartners(): AnalyticsPartnerOption[] {
  const store = loadAdminStore();
  const fromTokens = store.partnerTokens
    .filter((token) => token.status === 'active')
    .map((token) => ({ id: token.id, name: token.partnerName }));

  const fromContent = new Map<string, string>();
  getPublicEvents().forEach((event) => {
    const name = EVENT_ORGANIZERS[event.id] ?? (event.partnerId ? 'Partenaire' : null);
    if (event.partnerId && name) fromContent.set(event.partnerId, name);
  });

  const merged = [...fromTokens];
  fromContent.forEach((name, id) => {
    if (!merged.some((item) => item.id === id)) merged.push({ id, name });
  });

  return merged.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function getAnalyticsContent(): AnalyticsContentOption[] {
  const events = getPublicEvents().map((event) => ({
    id: event.id,
    name: event.title,
    type: 'event' as const,
    partnerName: EVENT_ORGANIZERS[event.id] ?? null,
    partnerId: event.partnerId,
    category: event.category,
    clicks: event.clickCount,
    impressions: estimateImpressions(event.clickCount, event.title.length),
  }));

  const locations = getHomeLocations().map((location) => ({
    id: location.id,
    name: location.name,
    type: 'location' as const,
    partnerName: location.subtitle ?? null,
    partnerId: null as string | null,
    category: location.subCategory,
    clicks: location.clickCount,
    impressions: estimateImpressions(location.clickCount, location.name.length),
  }));

  return [...events, ...locations];
}

export interface AnalyticsFilters {
  partnerId: string;
  contentType: 'all' | 'event' | 'location';
  contentId: string;
}

export function computeAnalytics(filters: AnalyticsFilters): AnalyticsSnapshot {
  const store = loadAdminStore();
  const catalog = getAnalyticsContent();
  const partners = getAnalyticsPartners();

  let filtered = catalog;

  if (filters.contentType !== 'all') {
    filtered = filtered.filter((item) => item.type === filters.contentType);
  }

  if (filters.partnerId !== 'all') {
    const partner = partners.find((item) => item.id === filters.partnerId);
    filtered = filtered.filter((item) => item.partnerName === partner?.name);
  }

  if (filters.contentId !== 'all') {
    filtered = filtered.filter((item) => item.id === filters.contentId);
  }

  const eventItems = filtered.filter((item) => item.type === 'event');
  const totalClicks = filtered.reduce((sum, item) => sum + item.clicks, 0);
  const totalImpressions = filtered.reduce((sum, item) => sum + item.impressions, 0);
  const globalCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 100) : 0;

  const categoryRates = CATEGORY_KEYS.reduce(
    (acc, key) => {
      const items = eventItems.filter((item) => item.category === key);
      if (items.length === 0) {
        acc[key] = 0;
        return acc;
      }
      const clicks = items.reduce((sum, item) => sum + item.clicks, 0);
      const impressions = items.reduce((sum, item) => sum + item.impressions, 0);
      acc[key] = impressions > 0 ? Math.round((clicks / impressions) * 100) : 0;
      return acc;
    },
    {} as Record<(typeof CATEGORY_KEYS)[number], number>,
  );

  const topPerformers = [...filtered]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5)
    .map((item, index) => ({
      rank: index + 1,
      id: item.id,
      name: item.name,
      clicks: item.clicks,
      conversionRate: item.impressions > 0 ? Math.round((item.clicks / item.impressions) * 100) : 0,
      type: item.type,
      partnerName: item.partnerName,
      category: item.category,
    }));

  const partnerMap = new Map<string, number>();
  filtered.forEach((item) => {
    const key = item.partnerName ?? 'THE LOOP';
    partnerMap.set(key, (partnerMap.get(key) ?? 0) + item.clicks);
  });

  const partnerBreakdown = [...partnerMap.entries()]
    .map(([partnerName, clicks]) => ({
      partnerName,
      clicks,
      share: totalClicks > 0 ? Math.round((clicks / totalClicks) * 100) : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 6);

  const activePartners = store.partnerTokens.filter((token) => token.status === 'active').length;
  const scale = filtered.length / Math.max(catalog.length, 1);

  return {
    totalVisits: Math.round(totalImpressions * 1.05),
    eventClicks: eventItems.reduce((sum, item) => sum + item.clicks, 0),
    globalCtr,
    activePartners,
    visitsDelta: scale >= 0.8 ? '+18% vs sem. dernière' : '+6% vs sem. dernière',
    clicksDelta: scale >= 0.5 ? '+9% vs sem. dernière' : '+3% vs sem. dernière',
    ctrDelta: globalCtr >= 20 ? '+2 pts' : '+1 pt',
    partnersDelta: activePartners >= 7 ? '-1 ce mois' : '+1 ce mois',
    categoryRates,
    topPerformers,
    partnerBreakdown,
    dailyTrend: [
      { label: 'Lun', visits: Math.round(totalImpressions * 0.12), clicks: Math.round(totalClicks * 0.11) },
      { label: 'Mar', visits: Math.round(totalImpressions * 0.14), clicks: Math.round(totalClicks * 0.13) },
      { label: 'Mer', visits: Math.round(totalImpressions * 0.16), clicks: Math.round(totalClicks * 0.15) },
      { label: 'Jeu', visits: Math.round(totalImpressions * 0.18), clicks: Math.round(totalClicks * 0.17) },
      { label: 'Ven', visits: Math.round(totalImpressions * 0.2), clicks: Math.round(totalClicks * 0.19) },
      { label: 'Sam', visits: Math.round(totalImpressions * 0.12), clicks: Math.round(totalClicks * 0.13) },
      { label: 'Dim', visits: Math.round(totalImpressions * 0.08), clicks: Math.round(totalClicks * 0.12) },
    ],
  };
}

export type { AnalyticsContentOption };
