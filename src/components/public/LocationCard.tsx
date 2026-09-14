import { Link } from 'react-router-dom';
import type { Location, LocationSubCategory } from '@/types';
import { LOCATION_SUBCATEGORY_LABELS } from '@/types';
import { FavoriteButton } from '@/components/shared/FavoriteButton';

interface LocationCardProps {
  location: Location;
}

export function LocationCard({ location }: LocationCardProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-loop-border bg-loop-surface">
      {location.coverImageUrl && (
        <Link to={`/spots/${location.slug}`}>
          <img
            src={location.coverImageUrl}
            alt=""
            className="aspect-[16/10] w-full object-cover"
          />
        </Link>
      )}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="rounded-full bg-loop-gold/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-loop-gold">
            {LOCATION_SUBCATEGORY_LABELS[location.subCategory]}
          </span>
          <FavoriteButton type="location" itemId={location.id} />
        </div>
        <Link to={`/spots/${location.slug}`}>
          <h3 className="font-semibold leading-snug hover:text-loop-gold">{location.name}</h3>
        </Link>
        <p className="mt-1 text-xs text-loop-text-muted">{location.address}</p>
      </div>
    </article>
  );
}

interface LocationFilterProps {
  active: LocationSubCategory | 'all';
  onChange: (cat: LocationSubCategory | 'all') => void;
}

const SUBCATEGORIES: (LocationSubCategory | 'all')[] = [
  'all',
  'fine_dining',
  'hotels',
  'bars_lounges',
];

export function LocationFilter({ active, onChange }: LocationFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
      {SUBCATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            active === cat
              ? 'bg-loop-gold text-loop-black'
              : 'border border-loop-border text-loop-text-muted hover:border-loop-gold'
          }`}
        >
          {cat === 'all' ? 'Tous' : LOCATION_SUBCATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  );
}
