import { loadDemoFavorites } from '@/lib/demo-auth';
import { getPartnerStagingItems, loadAdminStore } from '@/lib/admin-store';
import { EVENT_ORGANIZERS, getPublicEvents, getHomeLocations } from '@/lib/demo-data';

export interface PartnerStatRow {
  id: string;
  name: string;
  type: 'event' | 'location';
  views: number;
  actionClicks: number;
  favorites: number;
}

export interface PartnerStatsSnapshot {
  totalViews: number;
  totalActionClicks: number;
  totalFavorites: number;
  rows: PartnerStatRow[];
}

function estimateViews(clicks: number): number {
  return Math.max(clicks * 4, clicks + 12);
}

export function getPartnerStats(partnerId: string, partnerName: string, workspaceEvents?: { title: string }[], workspaceAddresses?: { name: string }[]): PartnerStatsSnapshot {
  const store = loadAdminStore();
  const favorites = loadDemoFavorites(partnerId);
  const staging = getPartnerStagingItems(partnerId);

  const publishedEvents = store.publishedEvents.filter(
    (event) => event.partnerId === partnerId || EVENT_ORGANIZERS[event.id] === partnerName,
  );
  const publishedLocations = store.publishedLocations.filter((loc) =>
    loc.subtitle?.includes(partnerName) || loc.name.includes(partnerName),
  );

  const demoEvents = getPublicEvents().filter(
    (event) => event.partnerId === partnerId || EVENT_ORGANIZERS[event.id] === partnerName,
  );
  const demoLocations = getHomeLocations().filter(
    (loc) => loc.subtitle?.includes(partnerName) || loc.name.includes(partnerName),
  );

  const eventRows: PartnerStatRow[] = [...publishedEvents, ...demoEvents]
    .filter((event, index, arr) => arr.findIndex((e) => e.id === event.id) === index)
    .map((event) => ({
      id: event.id,
      name: event.title,
      type: 'event' as const,
      views: estimateViews(event.clickCount),
      actionClicks: event.clickCount,
      favorites: favorites.events.filter((id) => id === event.id).length,
    }));

  const locationRows: PartnerStatRow[] = [...publishedLocations, ...demoLocations]
    .filter((loc, index, arr) => arr.findIndex((l) => l.id === loc.id) === index)
    .map((loc) => ({
      id: loc.id,
      name: loc.name,
      type: 'location' as const,
      views: estimateViews(loc.clickCount),
      actionClicks: loc.clickCount,
      favorites: favorites.locations.filter((id) => id === loc.id).length,
    }));

  staging.events.forEach((item) => {
    if (!eventRows.some((row) => row.name === item.title)) {
      eventRows.push({
        id: item.id,
        name: item.title,
        type: 'event',
        views: 18,
        actionClicks: 4,
        favorites: 0,
      });
    }
  });

  staging.locations.forEach((item) => {
    if (!locationRows.some((row) => row.name === item.name)) {
      locationRows.push({
        id: item.id,
        name: item.name,
        type: 'location',
        views: 12,
        actionClicks: 2,
        favorites: 0,
      });
    }
  });

  workspaceEvents?.forEach((item) => {
    if (!eventRows.some((row) => row.name === item.title)) {
      eventRows.push({ id: `ws-${item.title}`, name: item.title, type: 'event', views: 8, actionClicks: 1, favorites: 0 });
    }
  });

  workspaceAddresses?.forEach((item) => {
    if (!locationRows.some((row) => row.name === item.name)) {
      locationRows.push({ id: `ws-${item.name}`, name: item.name, type: 'location', views: 6, actionClicks: 1, favorites: 0 });
    }
  });

  const rows = [...eventRows, ...locationRows].sort((a, b) => b.actionClicks - a.actionClicks);

  return {
    totalViews: rows.reduce((sum, row) => sum + row.views, 0),
    totalActionClicks: rows.reduce((sum, row) => sum + row.actionClicks, 0),
    totalFavorites: rows.reduce((sum, row) => sum + row.favorites, 0),
    rows,
  };
}
