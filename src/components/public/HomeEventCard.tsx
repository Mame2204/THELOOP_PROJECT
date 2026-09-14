import type { Event } from '@/types';
import { EVENT_CATEGORY_LABELS } from '@/types';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { EventMetaStrip } from '@/components/public/EventMetaStrip';
import { SwipeableCard } from '@/components/mobile/SwipeableCard';
import { getEventCategoryStyle } from '@/lib/event-styles';
import { LOOP_EVENT_POSTER_HEIGHT } from '@/lib/layout-constants';

interface HomeEventCardProps {
  event: Event;
  organizer?: string;
  isExclusive?: boolean;
}

export function HomeEventCard({ event, organizer, isExclusive = false }: HomeEventCardProps) {
  const style = getEventCategoryStyle(event.category);
  const hasPoster = Boolean(event.coverImageUrl);

  return (
    <article className="overflow-hidden rounded-2xl border border-loop-public-border bg-loop-public-surface shadow-sm">
      <SwipeableCard to={`/agenda/${event.slug}`} className="block">
        <div className="relative w-full overflow-hidden" style={{ height: LOOP_EVENT_POSTER_HEIGHT }}>
          {hasPoster ? (
            <>
              <img src={event.coverImageUrl!} alt="" className="h-full w-full object-cover" />
              <div className={`absolute inset-0 bg-gradient-to-t ${style.gradient} mix-blend-multiply`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            </>
          ) : (
            <div className={`h-full w-full bg-gradient-to-br ${style.fallback}`} />
          )}

          <div className="absolute inset-0 flex flex-col justify-between p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase ${style.badge}`}>
                  {style.emoji} {EVENT_CATEGORY_LABELS[event.category as keyof typeof EVENT_CATEGORY_LABELS] ?? event.category}
                </span>
                {isExclusive && (
                  <span className="inline-flex rounded-full bg-loop-gold px-2 py-0.5 text-[8px] font-bold uppercase text-black">
                    LoopX
                  </span>
                )}
              </div>
              <FavoriteButton type="event" itemId={event.id} variant="light" />
            </div>
            <div>
              <h3 className="line-clamp-1 text-sm font-bold leading-snug text-white">{event.title}</h3>
              {organizer && <p className="truncate text-[10px] text-white/75">Par {organizer}</p>}
            </div>
          </div>
        </div>
        <EventMetaStrip event={event} variant="inline" />
      </SwipeableCard>
    </article>
  );
}

export { EVENT_CATEGORY_STYLES as CATEGORY_STYLES };
