import type { EventCategory } from '@/types';

export type EventCategoryStyle = { fallback: string; overlay: string; emoji: string };

export const EVENT_CATEGORY_STYLES: Record<EventCategory, EventCategoryStyle> = {
  corporate: { fallback: '#4a0404', overlay: 'rgba(74, 4, 4, 0.55)', emoji: '💼' },
  nightlife: { fallback: '#991b1b', overlay: 'rgba(127, 29, 29, 0.55)', emoji: '🌙' },
  art_culture: { fallback: '#166534', overlay: 'rgba(22, 101, 52, 0.55)', emoji: '🎨' },
  gastronomie: { fallback: '#c2410c', overlay: 'rgba(194, 65, 12, 0.55)', emoji: '🍽️' },
};

const DEFAULT_STYLE: EventCategoryStyle = {
  fallback: '#374151',
  overlay: 'rgba(55, 65, 81, 0.55)',
  emoji: '🏷️',
};

/** Style carte / hero — tolère les catégories custom (slug inconnu). */
export function getEventCategoryStyle(category: string | null | undefined): EventCategoryStyle {
  if (!category) return DEFAULT_STYLE;
  return EVENT_CATEGORY_STYLES[category as EventCategory] ?? DEFAULT_STYLE;
}
