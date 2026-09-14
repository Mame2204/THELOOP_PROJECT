import { Link } from 'react-router-dom';

import { HomeEventCard } from '@/components/public/HomeEventCard';
import { VipLocationCard } from '@/components/public/VipLocationCard';
import { MobileContentLoader } from '@/components/mobile/MobileContentLoader';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/hooks/useFavorites';
import { filterEventsByQuery, filterLocationsByQuery } from '@/lib/search-utils';

export type FavorisFilter = 'all' | 'events' | 'locations';

interface MemberFavoritesGridProps {
  filter: FavorisFilter;
  query: string;
  variant?: 'light' | 'dark';
}

export function MemberFavoritesGrid({ filter, query, variant = 'light' }: MemberFavoritesGridProps) {
  const { favoriteEventIds, favoriteLocationIds } = useFavorites();
  const { isLoading, events, locations, organizers } = useContent();
  const isDark = variant === 'dark';

  if (isLoading) {
    return <MobileContentLoader label="Chargement de vos favoris…" />;
  }

  const favoriteEvents = filterEventsByQuery(
    events.filter((e) => favoriteEventIds.has(e.id)),
    query,
    organizers,
  );

  const favoriteLocations = filterLocationsByQuery(
    locations.filter((l) => favoriteLocationIds.has(l.id)),
    query,
  );

  const showEvents = filter === 'all' || filter === 'events';
  const showLocations = filter === 'all' || filter === 'locations';
  const hasSearch = query.trim().length > 0;
  const isEmpty = (showEvents ? favoriteEvents.length : 0) + (showLocations ? favoriteLocations.length : 0) === 0;

  const emptyBoxClass = isDark
    ? 'rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-12 text-center'
    : 'rounded-2xl border border-neutral-300 bg-white px-4 py-12 text-center shadow-md ring-1 ring-black/5';

  if (isEmpty) {
    return (
      <div className={emptyBoxClass}>
        <p className="text-3xl">♡</p>
        <p className={`mt-3 text-sm font-semibold ${isDark ? 'text-white' : 'text-loop-black'}`}>
          {hasSearch ? `Aucun favori pour « ${query.trim()} »` : 'Aucun favori pour le moment'}
        </p>
        <p className={`mt-1 text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
          {hasSearch
            ? 'Essayez un autre mot-clé ou changez de filtre.'
            : 'Explorez l\'agenda et les Spots, puis touchez le cœur pour sauvegarder.'}
        </p>
        {!hasSearch && (
          <div className="mt-5 flex justify-center gap-4">
            <Link to="/" className="text-xs font-bold text-loop-gold hover:underline">
              Voir l&apos;agenda
            </Link>
            <Link to="/spots" className="text-xs font-bold text-loop-gold hover:underline">
              Explorer les Spots
            </Link>
          </div>
        )}
      </div>
    );
  }

  const sectionTitleClass = `mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${
    isDark ? 'text-neutral-400' : 'text-neutral-600'
  }`;
  const dividerClass = isDark ? 'bg-neutral-700' : 'bg-neutral-300';

  return (
    <div className="space-y-6">
      {showEvents && favoriteEvents.length > 0 && (
        <section>
          <h2 className={sectionTitleClass}>
            <span className={`h-px flex-1 ${dividerClass}`} />
            Événements
            <span className="rounded-full bg-loop-black px-2 py-0.5 text-[9px] text-white">{favoriteEvents.length}</span>
            <span className={`h-px flex-1 ${dividerClass}`} />
          </h2>
          <div className="grid gap-3">
            {favoriteEvents.map((event) => (
              <div key={event.id} className={`rounded-xl ring-2 ${isDark ? 'ring-loop-gold/20' : 'ring-loop-black/10'}`}>
                <HomeEventCard event={event} organizer={organizers[event.id]} isExclusive={event.visibility === 'prime'} />
              </div>
            ))}
          </div>
        </section>
      )}

      {showLocations && favoriteLocations.length > 0 && (
        <section>
          <h2 className={sectionTitleClass}>
            <span className={`h-px flex-1 ${dividerClass}`} />
            Adresses
            <span className="rounded-full bg-loop-black px-2 py-0.5 text-[9px] text-white">{favoriteLocations.length}</span>
            <span className={`h-px flex-1 ${dividerClass}`} />
          </h2>
          <div className="grid gap-3">
            {favoriteLocations.map((location) => (
              <div key={location.id} className={`rounded-xl ring-2 ${isDark ? 'ring-loop-gold/20' : 'ring-loop-black/10'}`}>
                <VipLocationCard location={location} isExclusive={location.visibility === 'prime'} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
