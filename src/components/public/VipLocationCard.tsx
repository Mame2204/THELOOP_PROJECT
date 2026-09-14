import type { HomeLocation } from '@/lib/demo-data';
import { formatFavoriteCount } from '@/lib/location-actions';
import { favoriteCountToRating } from '@/lib/location-rating';
import { LOOP_GUIDE_IMAGE_HEIGHT } from '@/lib/layout-constants';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { SwipeableCard } from '@/components/mobile/SwipeableCard';

interface VipLocationCardProps {
  location: HomeLocation;
  isExclusive?: boolean;
}

function LikeStarRating({ favoriteCount }: { favoriteCount: number }) {
  const rating = favoriteCountToRating(favoriteCount);
  const full = Math.round(rating);

  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`text-[10px] ${i < full ? 'text-amber-400' : 'text-white/30'}`}>
            ★
          </span>
        ))}
      </div>
      <span className="text-[9px] font-semibold text-white/80">♥ {formatFavoriteCount(favoriteCount)}</span>
    </div>
  );
}

export function VipLocationCard({ location, isExclusive = false }: VipLocationCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-loop-public-border bg-loop-public-surface shadow-sm">
      <SwipeableCard to={`/spots/${location.slug}`} className="block">
        <div className="relative w-full overflow-hidden" style={{ height: LOOP_GUIDE_IMAGE_HEIGHT }}>
          {location.coverImageUrl ? (
            <img src={location.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-between p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[8px] font-semibold text-white backdrop-blur-sm">
                  📍 {location.district}
                </span>
                {isExclusive && (
                  <span className="inline-flex rounded-full bg-loop-gold px-2 py-0.5 text-[8px] font-bold uppercase text-black">
                    Loop Prime
                  </span>
                )}
              </div>
              <FavoriteButton type="location" itemId={location.id} variant="overlay" className="!h-8 !w-8 text-xs" />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-1 text-sm font-bold text-white">{location.name}</h3>
                <p className="truncate text-[10px] text-white/75">{location.subtitle}</p>
              </div>
              <LikeStarRating favoriteCount={location.favoriteCount} />
            </div>
          </div>
        </div>
      </SwipeableCard>
    </article>
  );
}
