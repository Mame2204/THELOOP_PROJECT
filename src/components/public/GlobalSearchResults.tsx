import { Link } from 'react-router-dom';
import { useContent } from '@/context/ContentContext';
import { useAuth } from '@/hooks/useAuth';
import { usePublicSearch } from '@/hooks/usePublicSearch';
import { filterEventsByQuery, filterLocationsByQuery } from '@/lib/search-utils';
import { canViewPrimeContent } from '@/types';

export function GlobalSearchResults() {
  const { query, isOpen } = usePublicSearch();
  const { role } = useAuth();
  const { publicEvents, getHomeLocations, organizers } = useContent();
  const isPrime = canViewPrimeContent(role);
  const q = query.trim();

  // Loop Prime : la recherche filtre déjà l'agenda / les Spots — pas de panneau global en haut
  if (!isOpen || !q || isPrime) return null;

  const events = filterEventsByQuery(publicEvents, q, organizers).slice(0, 5);
  const locations = filterLocationsByQuery(
    getHomeLocations().filter((l) => l.visibility !== 'prime'),
    q,
  ).slice(0, 5);

  const hasResults = events.length > 0 || locations.length > 0;

  return (
    <div className="border-b border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        Résultats pour « {q} »
      </p>
      {!hasResults ? (
        <p className="mt-2 text-sm text-neutral-500">Aucun résultat trouvé.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {events.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-loop-gold">Événements</p>
              <ul className="mt-1 space-y-1">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link to={`/agenda/${e.slug}`} className="text-sm font-medium text-loop-black hover:underline">
                      {e.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {locations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-loop-gold">Adresses</p>
              <ul className="mt-1 space-y-1">
                {locations.map((l) => (
                  <li key={l.id}>
                    <Link to={`/spots/${l.slug}`} className="text-sm font-medium text-loop-black hover:underline">
                      {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}