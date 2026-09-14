import { useState } from 'react';
import type { EventCategory } from '@/types';
import { EVENT_CATEGORY_LABELS } from '@/types';
import { PARTNER_ACTIVITY_LABELS } from '@/types/partner';
import type { StagingEventItem, StagingLocationItem } from '@/types/admin';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';
import { generatePartnerTokenCode, useAdminData } from '@/hooks/useAdminData';

type ModerationTab = 'applications' | 'events' | 'locations';
type RejectTarget =
  | { kind: 'application'; id: string; label: string }
  | { kind: 'event'; id: string; label: string }
  | { kind: 'location'; id: string; label: string };

const TAB_LABELS: { id: ModerationTab; label: string }[] = [
  { id: 'applications', label: 'Demandes de Partenariat' },
  { id: 'events', label: 'Événements en Staging' },
  { id: 'locations', label: 'Lieux & Adresses' },
];

export function AdminModerationPage() {
  const {
    pendingApplications,
    pendingStagingEvents,
    pendingStagingLocations,
    approveApplication,
    rejectApplication,
    approveEvent,
    rejectEvent,
    updateEvent,
    approveLocation,
    rejectLocation,
    updateLocation,
  } = useAdminData();

  const [tab, setTab] = useState<ModerationTab>('applications');
  const [approveModalId, setApproveModalId] = useState<string | null>(null);
  const [tokenCode, setTokenCode] = useState(generatePartnerTokenCode());
  const [expiresAt, setExpiresAt] = useState('2026-12-31');
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [editEvent, setEditEvent] = useState<StagingEventItem | null>(null);
  const [editLocation, setEditLocation] = useState<StagingLocationItem | null>(null);

  const selectedApp = pendingApplications.find((a) => a.id === approveModalId);

  function handleApproveApplication() {
    if (!approveModalId) return;
    approveApplication(approveModalId, tokenCode, new Date(expiresAt).toISOString());
    setApproveModalId(null);
    setTokenCode(generatePartnerTokenCode());
  }

  function handleReject(reason: string) {
    if (!rejectTarget) return;
    if (rejectTarget.kind === 'application') rejectApplication(rejectTarget.id, reason);
    if (rejectTarget.kind === 'event') rejectEvent(rejectTarget.id, reason);
    if (rejectTarget.kind === 'location') rejectLocation(rejectTarget.id, reason);
    setRejectTarget(null);
  }

  function saveEventEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editEvent) return;
    updateEvent(editEvent.id, editEvent);
    setEditEvent(null);
  }

  function saveLocationEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editLocation) return;
    updateLocation(editLocation.id, editLocation);
    setEditLocation(null);
  }

  return (
    <div className="px-4 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-loop-gold">Staging</p>
        <h1 className="mt-1 text-2xl font-bold text-loop-black">Centre de Modération</h1>
      </header>

      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {TAB_LABELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
              tab === item.id ? 'bg-loop-black text-white' : 'border border-neutral-300 bg-white text-neutral-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {tab === 'applications' &&
          pendingApplications.map((app) => (
            <article key={app.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-loop-black">{app.companyName}</p>
                  <p className="text-sm text-neutral-600">{app.contactName} · {app.email}</p>
                  <p className="text-xs text-neutral-500">{app.phone} · {PARTNER_ACTIVITY_LABELS[app.activityType]}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">En attente</span>
              </div>
              <p className="mt-3 text-sm text-neutral-700">{app.message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setApproveModalId(app.id);
                    setTokenCode(generatePartnerTokenCode());
                  }}
                  className="flex-1 rounded-xl bg-loop-black py-2.5 text-xs font-bold text-white"
                >
                  Approuver
                </button>
                <button
                  type="button"
                  onClick={() => setRejectTarget({ kind: 'application', id: app.id, label: app.companyName })}
                  className="flex-1 rounded-xl border border-red-300 py-2.5 text-xs font-bold text-red-600"
                >
                  Rejeter
                </button>
              </div>
            </article>
          ))}

        {tab === 'events' &&
          pendingStagingEvents.map((event) => (
            <article key={event.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="font-bold text-loop-black">{event.title}</p>
              <p className="text-xs text-neutral-500">
                {event.partnerName} · {EVENT_CATEGORY_LABELS[event.category]} · {event.venueName}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-neutral-700">{event.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditEvent({ ...event })}
                  className="rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-bold text-loop-black"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => approveEvent(event.id)}
                  className="flex-1 rounded-xl bg-loop-black py-2.5 text-xs font-bold text-white"
                >
                  Approuver → Live
                </button>
                <button
                  type="button"
                  onClick={() => setRejectTarget({ kind: 'event', id: event.id, label: event.title })}
                  className="flex-1 rounded-xl border border-red-300 py-2.5 text-xs font-bold text-red-600"
                >
                  Rejeter
                </button>
              </div>
            </article>
          ))}

        {tab === 'locations' &&
          pendingStagingLocations.map((loc) => (
            <article key={loc.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="font-bold text-loop-black">{loc.name}</p>
              <p className="text-xs text-neutral-500">{loc.partnerName} · {loc.address}, {loc.city}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditLocation({ ...loc })}
                  className="rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-bold text-loop-black"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => approveLocation(loc.id)}
                  className="flex-1 rounded-xl bg-loop-black py-2.5 text-xs font-bold text-white"
                >
                  Approuver → Spots
                </button>
                <button
                  type="button"
                  onClick={() => setRejectTarget({ kind: 'location', id: loc.id, label: loc.name })}
                  className="flex-1 rounded-xl border border-red-300 py-2.5 text-xs font-bold text-red-600"
                >
                  Rejeter
                </button>
              </div>
            </article>
          ))}

        {tab === 'applications' && pendingApplications.length === 0 && (
          <EmptyState message="Aucune demande de partenariat en attente." />
        )}
        {tab === 'events' && pendingStagingEvents.length === 0 && (
          <EmptyState message="Aucun événement en staging." />
        )}
        {tab === 'locations' && pendingStagingLocations.length === 0 && (
          <EmptyState message="Aucune adresse en staging." />
        )}
      </div>

      {approveModalId && selectedApp && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-loop-black">Valider le partenaire</h2>
            <p className="mt-1 text-sm text-neutral-600">{selectedApp.companyName}</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-neutral-500">Code Partenaire</span>
                <input
                  value={tokenCode}
                  onChange={(e) => setTokenCode(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-loop-black"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-500">Date d&apos;expiration</span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
                />
              </label>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setApproveModalId(null)} className="rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold">
                Annuler
              </button>
              <button type="button" onClick={handleApproveApplication} className="rounded-xl bg-loop-black py-2.5 text-sm font-bold text-white">
                Activer le code
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <RejectReasonModal
          title="Motif de refus"
          subtitle={rejectTarget.label}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleReject}
        />
      )}

      {editEvent && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <form onSubmit={saveEventEdit} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-loop-black">Modifier l&apos;événement staging</h2>
            <div className="mt-4 space-y-3">
              <input value={editEvent.title} onChange={(e) => setEditEvent({ ...editEvent, title: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm" placeholder="Titre" />
              <textarea value={editEvent.description} onChange={(e) => setEditEvent({ ...editEvent, description: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm" rows={3} placeholder="Description" />
              <select value={editEvent.category} onChange={(e) => setEditEvent({ ...editEvent, category: e.target.value as EventCategory })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm">
                {(Object.keys(EVENT_CATEGORY_LABELS) as EventCategory[]).map((key) => (
                  <option key={key} value={key}>{EVENT_CATEGORY_LABELS[key]}</option>
                ))}
              </select>
              <input value={editEvent.venueName} onChange={(e) => setEditEvent({ ...editEvent, venueName: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm" placeholder="Lieu" />
              <input type="datetime-local" value={editEvent.startsAt.slice(0, 16)} onChange={(e) => setEditEvent({ ...editEvent, startsAt: new Date(e.target.value).toISOString() })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditEvent(null)} className="rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold">Annuler</button>
              <button type="submit" className="rounded-xl bg-loop-black py-2.5 text-sm font-bold text-white">Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {editLocation && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <form onSubmit={saveLocationEdit} className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-loop-black">Modifier l&apos;adresse staging</h2>
            <div className="mt-4 space-y-3">
              <input value={editLocation.name} onChange={(e) => setEditLocation({ ...editLocation, name: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm" placeholder="Nom" />
              <input value={editLocation.address} onChange={(e) => setEditLocation({ ...editLocation, address: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm" placeholder="Adresse" />
              <input value={editLocation.city} onChange={(e) => setEditLocation({ ...editLocation, city: e.target.value })} className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm" placeholder="Ville" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditLocation(null)} className="rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold">Annuler</button>
              <button type="submit" className="rounded-xl bg-loop-black py-2.5 text-sm font-bold text-white">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
      {message}
    </p>
  );
}
