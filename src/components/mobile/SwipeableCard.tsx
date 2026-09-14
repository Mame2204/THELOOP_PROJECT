import { type ReactNode, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

interface SwipeableCardProps {
  to: string;
  children: ReactNode;
  className?: string;
}

export function SwipeableCard({ to, children, className = '' }: SwipeableCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = e.touches[0].clientX - startX.current;
    const clamped = Math.max(-48, Math.min(48, delta * 0.35));
    setOffsetX(clamped);
  }

  function onTouchEnd() {
    dragging.current = false;
    setOffsetX(0);
  }

  return (
    <Link
      ref={ref}
      to={to}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        transform: offsetX ? `translateX(${offsetX}px)` : undefined,
        transition: dragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      className={`native-card block touch-press active:scale-[0.98] ${className}`}
    >
      {children}
    </Link>
  );
}
