import { useState } from 'react';
import type { EventCategory } from '@/types';
import { MobileAppBar } from '@/components/mobile/MobileAppBar';
import { FilterPills } from '@/components/public/FilterPills';
import { HeroSlider } from '@/components/shared/HeroSlider';
import { HomeEventCard } from '@/components/public/HomeEventCard';
import { usePublicSearch } from '@/hooks/usePublicSearch';
import { useAuth } from '@/hooks/useAuth';
import { filterEventsByQuery } from '@/lib/search-utils';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { MobileContentLoader } from '@/components/mobile/MobileContentLoader';
import { useContent } from '@/context/ContentContext';
import { EVENT_CATEGORY_LABELS, canViewPrimeContent } from '@/types';

type AgendaFilter = EventCategory | 'all' | 'loopx';

const AGENDA_FILTERS: { value: AgendaFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'corporate', label: EVENT_CATEGORY_LABELS.corporate },
  { value: 'nightlife', label: EVENT_CATEGORY_LABELS.nightlife },
  { value: 'art_culture', label: EVENT_CATEGORY_LABELS.art_culture },
  { value: 'gastronomie', label: EVENT_CATEGORY_LABELS.gastronomie },
  { value: 'loopx', label: 'LoopX' },
];

export function HomePage() {
  const [eventFilter, setEventFilter] = useState<AgendaFilter>('all');
  const { query } = usePublicSearch();
  const { role } = useAuth();
  const { shell } = useMemberTheme();
  const { isLoading, publicEvents, primeEvents, organizers } = useContent();
  const canViewExclusive = canViewPrimeContent(role);
  const agendaFilters = AGENDA_FILTERS.filter((f) => f.value !== 'loopx' || canViewExclusive);

  const filteredPublic = filterEventsByQuery(
    publicEvents.filter((e) => eventFilter === 'all' || eventFilter === 'loopx' || e.category === eventFilter),
    query,
    organizers,
  );

  const exclusiveEvents = filterEventsByQuery(
    primeEvents.filter((e) => eventFilter === 'all' || eventFilter === 'loopx' || e.category === eventFilter),
    query,
    organizers,
  );

  const displayedEvents =
    eventFilter === 'loopx'
      ? canViewExclusive
        ? exclusiveEvents
        : []
      : [...filteredPublic, ...(canViewExclusive ? exclusiveEvents : [])];

  const hasSearch = query.trim().length > 0;
  const showPrimeUpsell = eventFilter === 'loopx' && !canViewExclusive;

  return (
    <div className={`min-h-full pb-4 ${shell.pageTint}`}>
      <MobileAppBar />
      <div className="px-4 pt-3">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${shell.pageKicker}`}>Agenda</p>
        <h1 className={`mt-0.5 text-xl font-bold ${shell.pageTitle}`}>Événements</h1>
      </div>
      {!hasSearch && <HeroSlider />}
      {isLoading ? (
        <MobileContentLoader />
      ) : (
        <>
      <FilterPills
        options={agendaFilters}
        active={eventFilter}
        onChange={setEventFilter}
        activeClassName={`${shell.filterActive} shadow-sm`}
        inactiveClassName={shell.filterInactive}
      />

      <section className="native-list space-y-3 px-4 pb-2">
        {showPrimeUpsell && (
          <p className="py-8 text-center text-sm text-loop-public-muted">
            Événements LoopX réservés aux membres Loop Prime.
          </p>
        )}

        {displayedEvents.map((event) => (
          <HomeEventCard
            key={event.id}
            event={event}
            organizer={organizers[event.id]}
            isExclusive={event.visibility === 'prime'}
          />
        ))}

        {!showPrimeUpsell && displayedEvents.length === 0 && (
          <p className={`py-12 text-center text-sm ${shell.pageKicker}`}>
            {hasSearch ? `Aucun événement pour « ${query.trim()} ».` : 'Aucun événement dans cette catégorie.'}
          </p>
        )}
      </section>
        </>
      )}
    </div>
  );
}
