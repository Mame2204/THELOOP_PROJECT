export type EventCategoryStyle = {
  badge: string;
  gradient: string;
  fallback: string;
  emoji: string;
};

export const EVENT_CATEGORY_STYLES: Record<string, EventCategoryStyle> = {
  corporate: {
    badge: 'bg-black/40 text-white backdrop-blur-sm',
    gradient: 'from-[#4a0404]/90 to-[#8b0000]/90',
    fallback: 'from-[#4a0404] to-[#8b0000]',
    emoji: '💼',
  },
  nightlife: {
    badge: 'bg-black/40 text-white backdrop-blur-sm',
    gradient: 'from-red-900/90 to-red-600/90',
    fallback: 'from-red-700 to-red-500',
    emoji: '🌙',
  },
  art_culture: {
    badge: 'bg-black/40 text-white backdrop-blur-sm',
    gradient: 'from-green-900/90 to-green-600/90',
    fallback: 'from-green-800 to-green-600',
    emoji: '🎨',
  },
  gastronomie: {
    badge: 'bg-black/40 text-white backdrop-blur-sm',
    gradient: 'from-orange-900/90 to-orange-600/90',
    fallback: 'from-orange-700 to-orange-500',
    emoji: '🍽️',
  },
};

const DEFAULT_STYLE: EventCategoryStyle = {
  badge: 'bg-black/40 text-white backdrop-blur-sm',
  gradient: 'from-gray-900/90 to-gray-600/90',
  fallback: 'from-gray-700 to-gray-500',
  emoji: '🏷️',
};

export function getEventCategoryStyle(category: string | null | undefined): EventCategoryStyle {
  if (!category) return DEFAULT_STYLE;
  return EVENT_CATEGORY_STYLES[category] ?? DEFAULT_STYLE;
}
