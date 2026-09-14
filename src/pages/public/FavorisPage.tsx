import { useState } from 'react';
import { MobileAppBar } from '@/components/mobile/MobileAppBar';
import { FilterPills } from '@/components/public/FilterPills';
import { MemberFavoritesGrid, type FavorisFilter } from '@/components/public/MemberFavoritesGrid';
import { usePublicSearch } from '@/hooks/usePublicSearch';
import { useMemberTheme } from '@/hooks/useMemberTheme';

const FAVORIS_FILTERS: { value: FavorisFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'events', label: 'Événements' },
  { value: 'locations', label: 'Adresses' },
];

export function FavorisPage() {
  const [filter, setFilter] = useState<FavorisFilter>('all');
  const { query } = usePublicSearch();
  const { theme } = useMemberTheme();
  const { profile } = theme;
  const isPrime = theme.grade === 'prime';

  return (
    <div className={`min-h-full transition-colors duration-500 ${profile.pageBg}`}>
      <MobileAppBar title="Favoris" />

      <div className="px-4 pt-2">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${profile.pageKicker}`}>
          Compte membre
        </p>
        <p className={`mt-1 text-sm ${isPrime ? 'text-neutral-400' : 'text-neutral-600'}`}>
          Événements et adresses sauvegardés
        </p>

        <div className="mt-4">
          <FilterPills options={FAVORIS_FILTERS} active={filter} onChange={setFilter} />
        </div>

        <div className="mt-4">
          <MemberFavoritesGrid filter={filter} query={query} variant={isPrime ? 'dark' : 'light'} />
        </div>
      </div>
    </div>
  );
}
