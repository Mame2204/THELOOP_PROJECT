import { Link } from 'react-router-dom';
import type { Event, EventCategory } from '@/types';
import { EVENT_CATEGORY_LABELS } from '@/types';
import { FavoriteButton } from '@/components/shared/FavoriteButton';

interface EventCardProps {
  event: Event;
}

export function EventCard({ event }: EventCardProps) {
  const date = new Date(event.startsAt);

  return (
    <article className="overflow-hidden rounded-2xl border border-loop-border bg-loop-surface">
      {event.coverImageUrl && (
        <Link to={`/agenda/${event.slug}`}>
          <img
            src={event.coverImageUrl}
            alt=""
            className="aspect-[16/10] w-full object-cover"
          />
        </Link>
      )}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="rounded-full bg-loop-gold/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-loop-gold">
            {EVENT_CATEGORY_LABELS[event.category]}
          </span>
          <FavoriteButton type="event" itemId={event.id} />
        </div>
        <Link to={`/agenda/${event.slug}`}>
          <h3 className="font-semibold leading-snug hover:text-loop-gold">{event.title}</h3>
        </Link>
        <p className="mt-1 text-xs text-loop-text-muted">
          {date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {event.venueName}
        </p>
        {event.entryPrice !== null && (
          <p className="mt-1 text-sm font-medium text-loop-gold">
            {event.entryPrice.toLocaleString('fr-FR')} {event.currency}
          </p>
        )}
      </div>
    </article>
  );
}

interface EventFilterProps {
  active: EventCategory | 'all';
  onChange: (cat: EventCategory | 'all') => void;
}

const CATEGORIES: (EventCategory | 'all')[] = [
  'all',
  'corporate',
  'nightlife',
  'art_culture',
  'gastronomie',
];

export function EventFilter({ active, onChange }: EventFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            active === cat
              ? 'bg-loop-gold text-loop-black'
              : 'border border-loop-border text-loop-text-muted hover:border-loop-gold'
          }`}
        >
          {cat === 'all' ? 'Tous' : EVENT_CATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  );
}
