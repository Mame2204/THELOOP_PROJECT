import { useParams, Link, Navigate } from 'react-router-dom';
import { MobileAppBar } from '@/components/mobile/MobileAppBar';
import { LocationPhotoGallery } from '@/components/public/LocationPhotoGallery';
import { LocationMetaStrip } from '@/components/public/LocationMetaStrip';
import { LocationActionBar } from '@/components/public/LocationActionBar';
import { SaveActionButton } from '@/components/public/SaveActionButton';
import { getLocationPrimaryAction } from '@/lib/location-actions';
import { MobileContentLoader } from '@/components/mobile/MobileContentLoader';
import { useContent } from '@/context/ContentContext';
import { useAuth } from '@/hooks/useAuth';
import { canViewPrimeContent } from '@/types';

export function LocationDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { role } = useAuth();
  const { isLoading, getLocationBySlug } = useContent();
  const location = slug ? getLocationBySlug(slug) : undefined;

  if (isLoading) {
    return <MobileContentLoader label="Chargement du spot…" />;
  }

  if (!location) {
    return (
      <div className="min-h-full bg-loop-public-bg px-4 py-12 text-center">
        <p className="text-loop-public-muted">Adresse introuvable.</p>
        <Link to="/spots" className="touch-press mt-4 inline-block text-loop-gold">← Retour aux Spots</Link>
      </div>
    );
  }

  if (location.visibility === 'prime' && !canViewPrimeContent(role)) {
    return <Navigate to="/spots" replace />;
  }

  const images =
    location.galleryImages.length > 0
      ? location.galleryImages
      : location.coverImageUrl
        ? [location.coverImageUrl]
        : [];

  const primaryAction = getLocationPrimaryAction(location);
  const ctaClass =
    'touch-press native-cta flex w-full items-center justify-center gap-2 rounded-2xl bg-loop-black py-4 text-sm font-bold text-white';

  return (
    <div className="min-h-full bg-loop-public-bg pb-28">
      <MobileAppBar title="Spot" showBack backTo="/spots" />

      <article className="px-4 pt-2">
        <LocationPhotoGallery
          images={images}
          name={location.name}
          district={location.district}
          favoriteCount={location.favoriteCount}
        />

        <div className="mt-3">
          <LocationMetaStrip location={location} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {location.tags.map((tag) => (
            <span
              key={tag.label}
              className="rounded-full border border-loop-public-border bg-loop-public-surface px-2.5 py-1 text-[10px] font-medium text-loop-public-text"
            >
              {tag.emoji} {tag.label}
            </span>
          ))}
        </div>

        <section className="mt-5">
          <p className="text-sm leading-relaxed text-loop-public-text">{location.description}</p>
        </section>

        {location.website && (
          <section className="mt-4">
            <a
              href={location.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-loop-gold"
            >
              Site web →
            </a>
          </section>
        )}

        <div className="mt-6">
          {primaryAction.external || primaryAction.href.startsWith('mailto:') ? (
            <a href={primaryAction.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>
              {primaryAction.label}
            </a>
          ) : (
            <Link to={primaryAction.href} className={ctaClass}>
              {primaryAction.label}
            </Link>
          )}
        </div>

        <div className="mt-3">
          <LocationActionBar location={location} />
        </div>
      </article>

      <div className="native-detail-bar">
        <SaveActionButton type="location" itemId={location.id} />
      </div>
    </div>
  );
}
