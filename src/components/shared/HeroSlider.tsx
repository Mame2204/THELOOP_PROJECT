import { LOOP_HERO_HEIGHT } from '@/lib/layout-constants';
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '@/context/ContentContext';
import { useAdminData } from '@/hooks/useAdminData';
import { resolveHeroBanners } from '@/lib/demo-data';
import type { HeroBanner } from '@/types';

interface HeroSliderProps {
  banners?: HeroBanner[];
}

export function HeroSlider({ banners }: HeroSliderProps) {
  const { store } = useAdminData();
  const { featuredBanners, isLoading } = useContent();
  const adminResolved = useMemo(
    () => resolveHeroBanners((banners ?? store.heroBanners).filter((item) => item.isActive)),
    [banners, store.heroBanners],
  );
  const activeBanners = featuredBanners.length > 0 ? featuredBanners : adminResolved;
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setCurrent(0);
  }, [activeBanners.length]);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % activeBanners.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [activeBanners.length]);

  if (isLoading || activeBanners.length === 0) return null;

  const banner = activeBanners[current];

  return (
    <section className="px-4 pt-1">
      <div className="relative overflow-hidden rounded-xl shadow-sm" style={{ height: LOOP_HERO_HEIGHT }}>
        <Link to={banner.linkUrl} className="block h-full">
          <img src={banner.imageUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3.5 pr-14">
            <span className="inline-flex items-center rounded-md bg-loop-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-loop-black shadow-sm">
              À la une
            </span>
            <h2 className="mt-1.5 line-clamp-2 text-xl font-bold leading-snug text-white drop-shadow-sm">{banner.title}</h2>
            {banner.subtitle && (
              <p className="mt-0.5 line-clamp-1 text-sm font-medium text-white/90 drop-shadow-sm">{banner.subtitle}</p>
            )}
          </div>
        </Link>
        {activeBanners.length > 1 && (
          <div className="absolute bottom-3.5 right-3 z-10 flex gap-1">
            {activeBanners.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setCurrent(i)}
                className={`h-1 rounded-full transition-all ${i === current ? 'w-4 bg-loop-gold' : 'w-1 bg-white/50'}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
