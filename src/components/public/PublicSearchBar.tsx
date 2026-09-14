import { useMemberTheme } from '@/hooks/useMemberTheme';
import { usePublicSearch } from '@/hooks/usePublicSearch';

export function PublicSearchBar() {
  const { isOpen, query, setQuery, closeSearch } = usePublicSearch();
  const { shell } = useMemberTheme();

  if (!isOpen) return null;

  return (
    <div className={`border-b px-4 py-2 ${shell.searchBar}`}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`absolute left-3 top-1/2 -translate-y-1/2 ${shell.searchIcon}`}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un mot-clé…"
            autoFocus
            className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none ${shell.searchInput}`}
          />
        </div>
        <button
          type="button"
          onClick={closeSearch}
          aria-label="Fermer la recherche"
          className={`shrink-0 rounded-lg px-2 py-2 text-xs font-semibold opacity-80 hover:opacity-100 ${shell.searchClose}`}
        >
          ✕
        </button>
      </div>
      {query.trim() && (
        <p className={`mt-1.5 text-[11px] ${shell.pageKicker}`}>
          Résultats filtrés pour « {query.trim()} »
        </p>
      )}
    </div>
  );
}
