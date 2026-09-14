import { useNavigate } from 'react-router-dom';
import { LoopLogo } from '@/components/shared/LoopLogo';
import { PublicSearchBar } from '@/components/public/PublicSearchBar';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { usePublicSearch } from '@/hooks/usePublicSearch';

interface MobileAppBarProps {
  title?: string;
  showBack?: boolean;
  backTo?: string;
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MobileAppBar({ title, showBack = false, backTo }: MobileAppBarProps) {
  const navigate = useNavigate();
  const { isMember, headerClass, shell } = useMemberTheme();
  const { isOpen: searchOpen, toggleSearch } = usePublicSearch();

  function handleBack() {
    if (backTo) {
      navigate(backTo);
      return;
    }
    navigate(-1);
  }

  return (
    <header className={`native-app-bar safe-top ${headerClass}`}>
      <div className="flex h-12 items-center justify-between gap-2 px-3">
        {showBack ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Retour"
            className={`touch-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${shell.searchBtn}`}
          >
            <IconBack />
          </button>
        ) : (
          <LoopLogo variant={isMember ? 'light' : 'blanc'} size="sm" />
        )}

        {title && (
          <h1 className={`min-w-0 flex-1 truncate text-center text-sm font-bold ${shell.pageTitle}`}>
            {title}
          </h1>
        )}

        {!title && !showBack && <div className="flex-1" />}

        <button
          type="button"
          onClick={toggleSearch}
          aria-label={searchOpen ? 'Fermer la recherche' : 'Rechercher'}
          aria-pressed={searchOpen}
          className={`touch-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
            searchOpen ? shell.searchBtnActive : shell.searchBtn
          }`}
        >
          <IconSearch />
        </button>
      </div>
      <PublicSearchBar />
    </header>
  );
}
