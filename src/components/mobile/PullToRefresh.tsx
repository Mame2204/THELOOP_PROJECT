import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';

interface PullToRefreshProps {
  scrollRef: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const PULL_THRESHOLD = 64;

export function PullToRefresh({ scrollRef, onRefresh, children }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const refreshingRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
    }
  }, [onRefresh]);

  function onTouchStart(e: React.TouchEvent) {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!pulling.current || refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      pulling.current = false;
      setPull(0);
      return;
    }
    const delta = Math.max(0, e.touches[0].clientY - startY.current);
    setPull(Math.min(delta * 0.45, 96));
  }

  function onTouchEnd() {
    if (!pulling.current) return;
    pulling.current = false;
    if (pull >= PULL_THRESHOLD) {
      void handleRefresh();
      return;
    }
    setPull(0);
  }

  const showIndicator = pull > 8 || refreshing;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {showIndicator && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-30 flex justify-center transition-transform duration-150"
          style={{ transform: `translateY(${refreshing ? 12 : pull - 28}px)` }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-loop-gold/40 bg-black/80">
            <span
              className={`block h-4 w-4 rounded-full border-2 border-loop-gold border-t-transparent ${
                refreshing ? 'animate-spin' : ''
              }`}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
