import { useState } from 'react';
import { MobileAppBar } from '@/components/mobile/MobileAppBar';
import { FilterPills } from '@/components/public/FilterPills';
import { VipLocationCard } from '@/components/public/VipLocationCard';
import { usePublicSearch } from '@/hooks/usePublicSearch';
import { useAuth } from '@/hooks/useAuth';
import { filterLocationsByQuery } from '@/lib/search-utils';
import type { LocationSubCategory } from '@/types';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { MobileContentLoader } from '@/components/mobile/MobileContentLoader';
import { useContent } from '@/context/ContentContext';
import { LOCATION_SUBCATEGORY_LABELS, canViewPrimeContent } from '@/types';

type SpotsFilter = LocationSubCategory | 'all' | 'prime';

const SPOTS_FILTERS: { value: SpotsFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'fine_dining', label: LOCATION_SUBCATEGORY_LABELS.fine_dining },
  { value: 'hotels', label: LOCATION_SUBCATEGORY_LABELS.hotels },
  { value: 'bars_lounges', label: LOCATION_SUBCATEGORY_LABELS.bars_lounges },
  { value: 'prime', label: 'Loop Prime' },
];

export function GuidePage() {
  const [subCategory, setSubCategory] = useState<SpotsFilter>('all');
  const { query } = usePublicSearch();
  const { role } = useAuth();
  const { shell } = useMemberTheme();
  const { isLoading, getHomeLocations, primeLocations } = useContent();
  const canViewExclusive = canViewPrimeContent(role);
  const spotsFilters = SPOTS_FILTERS.filter((f) => f.value !== 'prime' || canViewExclusive);

  const categoryFilter = (loc: ReturnType<typeof getHomeLocations>[number]) =>
    subCategory === 'all' || subCategory === 'prime' || loc.subCategory === subCategory;

  const publicLocations = filterLocationsByQuery(
    getHomeLocations(subCategory === 'all' || subCategory === 'prime' ? undefined : subCategory).filter(
      (l) => l.visibility !== 'prime' && categoryFilter(l),
    ),
    query,
  );

  const exclusiveLocations = filterLocationsByQuery(
    primeLocations.filter(categoryFilter),
    query,
  );

  const displayedLocations =
    subCategory === 'prime'
      ? canViewExclusive
        ? exclusiveLocations
        : []
      : [...publicLocations, ...(canViewExclusive ? exclusiveLocations : [])];

  const showPrimeUpsell = subCategory === 'prime' && !canViewExclusive;

  return (
    <div className={`min-h-full pb-4 ${shell.pageTint}`}>
      <MobileAppBar />
      <div className="px-4 pt-3">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${shell.pageKicker}`}>Spots</p>
        <h1 className={`mt-0.5 text-xl font-bold ${shell.pageTitle}`}>Adresses & lieux</h1>
      </div>
      <FilterPills
        options={spotsFilters}
        active={subCategory}
        onChange={setSubCategory}
        activeClassName={`${shell.filterActive} shadow-sm`}
        inactiveClassName={shell.filterInactive}
      />

      {isLoading ? (
        <MobileContentLoader />
      ) : (
      <section className="native-list space-y-3 px-4 pb-2">
        {showPrimeUpsell && (
          <p className="py-8 text-center text-sm text-loop-public-muted">
            Adresses réservées aux membres Loop Prime.
          </p>
        )}

        {displayedLocations.map((loc) => (
          <VipLocationCard key={loc.id} location={loc} isExclusive={loc.visibility === 'prime'} />
        ))}

        {!showPrimeUpsell && displayedLocations.length === 0 && (
          <p className={`py-12 text-center text-sm ${shell.pageKicker}`}>
            {query.trim() ? `Aucune adresse pour « ${query.trim()} ».` : 'Aucune adresse dans cette catégorie.'}
          </p>
        )}
      </section>
      )}
    </div>
  );
}
