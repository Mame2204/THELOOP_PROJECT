import { LoopLogo } from '@/components/shared/LoopLogo';
import { UserAccountMenu } from '@/components/public/UserAccountMenu';
import { NotificationsMenu } from '@/components/public/NotificationsMenu';
import { PublicSearchBar } from '@/components/public/PublicSearchBar';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { usePublicSearch } from '@/hooks/usePublicSearch';
import { isAuthenticated } from '@/types';

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  );
}

export function PublicHeader() {
  const { role } = useAuth();
  const { openAuthModal } = useFavorites();
  const { isMember, headerClass, shell } = useMemberTheme();
  const { isOpen: searchOpen, toggleSearch } = usePublicSearch();
  const isAnonymous = role === 'USER_ANONYMOUS';
  const showNotifications = isAuthenticated(role);

  const searchActiveClass = searchOpen ? shell.searchBtnActive : shell.searchBtn;
  const anonymousBtn = shell.searchBtn;

  return (
    <header className={`sticky top-0 z-40 safe-top ${headerClass}`}>
      <div className="flex items-center justify-between px-4 py-2">
        <LoopLogo variant={isMember ? 'light' : 'blanc'} size="md" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSearch}
            aria-label={searchOpen ? 'Fermer la recherche' : 'Rechercher'}
            aria-pressed={searchOpen}
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${searchActiveClass}`}
          >
            <IconSearch />
          </button>
          {showNotifications && <NotificationsMenu />}
          {isAnonymous ? (
            <button
              type="button"
              onClick={openAuthModal}
              aria-label="Se connecter ou créer un compte gratuit"
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${anonymousBtn}`}
            >
              <IconUser />
            </button>
          ) : (
            <UserAccountMenu />
          )}
        </div>
      </div>
      <PublicSearchBar />
    </header>
  );
}
