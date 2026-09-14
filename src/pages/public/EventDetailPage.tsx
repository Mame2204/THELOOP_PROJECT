import { useParams, Link, Navigate } from 'react-router-dom';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { MobileAppBar } from '@/components/mobile/MobileAppBar';
import { EventActionBar } from '@/components/public/EventActionBar';
import { SaveActionButton } from '@/components/public/SaveActionButton';
import { EventMetaStrip } from '@/components/public/EventMetaStrip';
import { getEventCategoryStyle } from '@/lib/event-styles';
import { MobileContentLoader } from '@/components/mobile/MobileContentLoader';
import { useContent } from '@/context/ContentContext';
import { useAuth } from '@/hooks/useAuth';
import { EVENT_CATEGORY_LABELS, canViewPrimeContent } from '@/types';
import { getEventInfoUrl } from '@/lib/event-actions';

export function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { role } = useAuth();
  const { isLoading, getEventBySlug } = useContent();
  const event = slug ? getEventBySlug(slug) : undefined;

  if (isLoading) {
    return <MobileContentLoader label="Chargement de l'événement…" />;
  }

  if (!event) {
    return (
      <div className="min-h-full bg-loop-public-bg px-4 py-12 text-center">
        <p className="text-loop-public-muted">Événement introuvable.</p>
        <Link to="/" className="touch-press mt-4 inline-block text-loop-gold">← Retour à l&apos;agenda</Link>
      </div>
    );
  }

  if (event.visibility === 'prime' && !canViewPrimeContent(role)) {
    return <Navigate to="/" replace />;
  }

  const infoUrl = getEventInfoUrl(event);
  const style = getEventCategoryStyle(event.category);
  const hasPoster = Boolean(event.coverImageUrl);

  return (
    <div className="min-h-full bg-loop-public-bg pb-28">
      <MobileAppBar title="Événement" showBack backTo="/" />

      <article className="px-4 pt-2">
        <div className="relative overflow-hidden rounded-2xl">
          <div className="relative aspect-[16/10] w-full">
            {hasPoster ? (
              <>
                <img src={event.coverImageUrl!} alt="" className="h-full w-full object-cover" />
                <div className={`absolute inset-0 bg-gradient-to-t ${style.gradient} mix-blend-multiply`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
              </>
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${style.fallback}`} />
            )}
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div className="flex items-start justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${style.badge}`}>
                  {EVENT_CATEGORY_LABELS[event.category as keyof typeof EVENT_CATEGORY_LABELS] ?? event.category}
                </span>
                <FavoriteButton type="event" itemId={event.id} variant="light" />
              </div>
              <div>
                <h1 className="mt-1 text-xl font-bold leading-tight text-white">{event.title}</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-loop-public-border bg-loop-public-surface">
          <EventMetaStrip event={event} />
        </div>

        <section className="mt-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-loop-public-muted">
            À propos de l&apos;événement
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-loop-public-text">{event.description}</p>
        </section>

        {event.organizerName ? (
          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-loop-public-muted">Organisateur</h2>
            <p className="mt-2 text-sm leading-relaxed text-loop-public-text">{event.organizerName}</p>
          </section>
        ) : null}

        {event.program && (
          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-loop-public-muted">Programme</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-loop-public-text">{event.program}</p>
          </section>
        )}

        {event.speakers.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-loop-public-muted">
              Speakers confirmés
            </h2>
            <ul className="space-y-2">
              {event.speakers.map((sp) => (
                <li
                  key={sp.id}
                  className="flex items-center gap-3 rounded-xl border border-loop-public-border bg-loop-public-surface p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-loop-black text-xs font-bold text-white">
                    {sp.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-loop-public-text">{sp.name}</p>
                    <p className="text-[11px] text-loop-public-muted">
                      {sp.title}{sp.company ? ` · ${sp.company}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6">
          <a
            href={infoUrl}
            target={infoUrl.startsWith('http') || infoUrl.startsWith('mailto:') ? '_blank' : undefined}
            rel={infoUrl.startsWith('http') || infoUrl.startsWith('mailto:') ? 'noopener noreferrer' : undefined}
            className="touch-press native-cta flex w-full items-center justify-center gap-2 rounded-2xl bg-loop-black py-4 text-sm font-bold text-white"
          >
            En savoir plus
          </a>
        </div>

        <div className="mt-3">
          <EventActionBar event={event} />
        </div>
      </article>

      <div className="native-detail-bar">
        <SaveActionButton type="event" itemId={event.id} />
      </div>
    </div>
  );
}
