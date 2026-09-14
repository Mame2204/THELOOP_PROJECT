import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

const TAB_ORDER = ['/spots', '/', '/favoris', '/profil'] as const;

function getTabIndex(pathname: string): number {
  if (pathname === '/spots' || pathname.startsWith('/spots/')) return 0;
  if (pathname === '/' || pathname.startsWith('/agenda/')) return 1;
  if (pathname === '/favoris') return 2;
  if (pathname === '/profil') return 3;
  return -1;
}

function isDetailRoute(pathname: string): boolean {
  return (
    (pathname.startsWith('/agenda/') && pathname !== '/agenda') ||
    (pathname.startsWith('/spots/') && pathname !== '/spots')
  );
}

interface MobilePageTransitionProps {
  children: ReactNode;
}

export function MobilePageTransition({ children }: MobilePageTransitionProps) {
  const { pathname } = useLocation();
  const prevIndex = useRef(getTabIndex(pathname));
  const direction = useRef<'left' | 'right' | 'none'>('none');

  const currentIndex = getTabIndex(pathname);
  const detail = isDetailRoute(pathname);

  useEffect(() => {
    if (detail || currentIndex < 0) {
      direction.current = 'none';
      prevIndex.current = currentIndex;
      return;
    }

    if (prevIndex.current >= 0 && currentIndex >= 0 && prevIndex.current !== currentIndex) {
      direction.current = currentIndex > prevIndex.current ? 'left' : 'right';
    } else {
      direction.current = 'none';
    }
    prevIndex.current = currentIndex;
  }, [pathname, currentIndex, detail]);

  const animClass = detail
    ? 'native-page-detail'
    : direction.current === 'left'
      ? 'native-page-slide-left'
      : direction.current === 'right'
        ? 'native-page-slide-right'
        : 'native-page-fade';

  return (
    <div key={pathname} className={`native-page ${animClass}`}>
      {children}
    </div>
  );
}

export function isMainTabRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/spots' ||
    pathname === '/favoris' ||
    pathname === '/profil'
  );
}

export { isDetailRoute };
