import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseSwipeBackOptions {
  enabled: boolean;
  edgeWidth?: number;
  threshold?: number;
}

/** Geste retour iOS-like depuis le bord gauche (pages détail). */
export function useSwipeBack({ enabled, edgeWidth = 28, threshold = 72 }: UseSwipeBackOptions) {
  const navigate = useNavigate();
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch || touch.clientX > edgeWidth) return;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      tracking.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX.current;
      const deltaY = Math.abs(touch.clientY - startY.current);
      if (deltaY > 48) tracking.current = false;
      if (deltaX > threshold && deltaY < 40) {
        tracking.current = false;
        navigate(-1);
      }
    }

    function onTouchEnd() {
      tracking.current = false;
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, edgeWidth, threshold, navigate]);
}
