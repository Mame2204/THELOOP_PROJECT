import { useRef, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from '@/layouts/BottomNav';
import { AuthModal } from '@/components/shared/AuthModal';
import { GlobalSearchResults } from '@/components/public/GlobalSearchResults';
import { MobilePageTransition, isMainTabRoute, isDetailRoute } from '@/layouts/MobilePageTransition';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { useMemberTheme } from '@/hooks/useMemberTheme';

const GRADE_SHELL_PATHS = ['/', '/spots', '/favoris', '/profil', '/prime'];

function usesGradeShell(pathname: string): boolean {
  return (
    GRADE_SHELL_PATHS.includes(pathname) ||
    pathname.startsWith('/agenda') ||
    pathname.startsWith('/spots/') ||
    pathname.startsWith('/prime')
  );
}

export function MainLayout() {
  const scrollRef = useRef<HTMLElement>(null);
  const { showAuthModal, closeAuthModal } = useFavorites();
  const { refresh: refreshContent } = useContent();
  const { shell } = useMemberTheme();
  const { pathname } = useLocation();
  const shellBg = usesGradeShell(pathname) ? shell.pageTint : 'bg-loop-black';
  const showTabBar = isMainTabRoute(pathname);
  const detail = isDetailRoute(pathname);

  useSwipeBack({ enabled: detail });

  const handleRefresh = useCallback(async () => {
    await refreshContent();
  }, [refreshContent]);

  return (
    <div className={`native-shell ${shellBg}`}>
      <div className="native-viewport">
        <PullToRefresh scrollRef={scrollRef} onRefresh={handleRefresh}>
          <main
            ref={scrollRef}
            className={`native-scroll ${showTabBar ? 'native-scroll-with-tabs' : 'native-scroll-full'} ${
              detail ? 'native-scroll-detail' : ''
            }`}
          >
            <GlobalSearchResults />
            <MobilePageTransition>
              <Outlet />
            </MobilePageTransition>
          </main>
        </PullToRefresh>
        {showTabBar && <BottomNav />}
        {showAuthModal && <AuthModal onClose={closeAuthModal} />}
      </div>
    </div>
  );
}
