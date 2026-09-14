import type { HomeLocation } from '@/lib/demo-data';

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-loop-public-muted">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function IconMoney() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-loop-gold">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-loop-public-muted">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" strokeLinecap="round" />
    </svg>
  );
}

interface LocationMetaStripProps {
  location: HomeLocation;
}

export function LocationMetaStrip({ location }: LocationMetaStripProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-loop-public-border bg-loop-public-surface">
      <div className="grid grid-cols-2 divide-x divide-loop-public-border border-b border-loop-public-border">
        <div className="flex items-start gap-2 px-3 py-3">
          <IconClock />
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wide text-loop-public-muted">Horaires</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-loop-public-text">
              {location.openingHours}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 px-3 py-3">
          <IconMoney />
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wide text-loop-public-muted">Tarifs</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-loop-gold">
              {location.priceLabel}
            </p>
          </div>
        </div>
      </div>

      {location.phone && (
        <a
          href={`tel:${location.phone.replace(/\s/g, '')}`}
          className="flex items-start gap-2 px-3 py-3 transition-colors hover:bg-loop-public-bg"
        >
          <IconPhone />
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wide text-loop-public-muted">Réservation</p>
            <p className="mt-0.5 text-[11px] font-semibold text-loop-public-text">{location.phone}</p>
          </div>
        </a>
      )}
    </div>
  );
}
