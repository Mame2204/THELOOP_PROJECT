import { useState } from 'react';
import { LOOP_GUIDE_IMAGE_HEIGHT } from '@/lib/layout-constants';
import { favoriteCountToRating } from '@/lib/location-rating';
import { formatFavoriteCount } from '@/lib/location-actions';

interface LocationPhotoGalleryProps {
  images: string[];
  name: string;
  district: string;
  favoriteCount: number;
}

function LikeStarRating({ favoriteCount }: { favoriteCount: number }) {
  const rating = favoriteCountToRating(favoriteCount);
  const full = Math.round(rating);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`text-xs ${i < full ? 'text-amber-400' : 'text-white/30'}`}>
            ★
          </span>
        ))}
      </div>
      <span className="text-xs font-bold text-white">♥ {formatFavoriteCount(favoriteCount)} likes</span>
    </div>
  );
}

export function LocationPhotoGallery({ images, name, district, favoriteCount }: LocationPhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex] ?? images[0];

  if (images.length === 0) return null;

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl" style={{ height: LOOP_GUIDE_IMAGE_HEIGHT }}>
        <img src={activeImage} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            📍 {district}
          </span>
          <h1 className="mt-2 text-xl font-bold leading-tight text-white">{name}</h1>
          <div className="mt-1">
            <LikeStarRating favoriteCount={favoriteCount} />
          </div>
        </div>
      </div>

      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none">
          {images.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Photo ${index + 1}`}
              aria-pressed={index === activeIndex}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                index === activeIndex
                  ? 'border-loop-black'
                  : 'border-loop-public-border opacity-80 hover:opacity-100'
              }`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
