import { useEffect, useState } from 'react';
import type { EventCategory } from '@/types';
import type { PartnerEvent } from '@/types/partner';
import { usePartnerData } from '@/hooks/usePartnerData';

type EventFormData = Omit<PartnerEvent, 'id' | 'createdAt' | 'status' | 'stagingId'>;

interface PartnerEventFormProps {
  onSuccess?: () => void;
  onCancel: () => void;
  initialValues?: PartnerEvent;
  onSubmit?: (data: EventFormData) => void;
  submitLabel?: string;
  title?: string;
}

function toLocalDateTime(iso: string | null) {
  if (!iso) return '';
  return iso.slice(0, 16);
}

export function PartnerEventForm({
  onSuccess,
  onCancel,
  initialValues,
  onSubmit,
  submitLabel = 'Soumettre',
  title = 'Nouvel événement',
}: PartnerEventFormProps) {
  const { workspace, platformCategories, addEvent } = usePartnerData();
  const [form, setForm] = useState({
    title: initialValues?.title ?? '',
    startsAt: toLocalDateTime(initialValues?.startsAt ?? null),
    endsAt: toLocalDateTime(initialValues?.endsAt ?? null),
    addressId: initialValues?.addressId ?? '',
    description: initialValues?.description ?? '',
    program: initialValues?.program ?? '',
    category: (initialValues?.category ?? 'corporate') as EventCategory,
    entryPrice: initialValues?.entryPrice != null ? String(initialValues.entryPrice) : '',
    speakers: initialValues?.speakers ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!form.addressId && workspace.addresses[0]) {
      setForm((prev) => ({ ...prev, addressId: workspace.addresses[0].id }));
    }
  }, [workspace.addresses, form.addressId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (workspace.addresses.length === 0) {
      setError('Ajoutez au moins une adresse dans « Mes Adresses » avant de créer un événement.');
      return;
    }

    const selected = workspace.addresses.find((a) => a.id === form.addressId);
    if (!selected) {
      setError('Sélectionnez une adresse valide.');
      return;
    }

    const payload: EventFormData = {
      title: form.title,
      description: form.description,
      program: form.program || null,
      category: form.category,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      addressId: selected.id,
      venueName: selected.name,
      venueAddress: `${selected.address}, ${selected.city}`,
      entryPrice: form.entryPrice ? Number(form.entryPrice) : null,
      currency: 'GNF',
      speakers: form.speakers,
    };

    if (onSubmit) {
      onSubmit(payload);
    } else {
      addEvent(payload);
      onSuccess?.();
    }
  }

  const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-loop-black';

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-300 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-loop-black">{title}</h2>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <div className="mt-3 space-y-2">
        <input type="text" placeholder="Titre de l'événement" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
        <input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={inputClass} />
        <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={inputClass} />
        <select required value={form.addressId} onChange={(e) => setForm({ ...form, addressId: e.target.value })} className={inputClass}>
          <option value="" disabled>Choisir le lieu / adresse</option>
          {workspace.addresses.map((addr) => (
            <option key={addr.id} value={addr.id}>{addr.name} — {addr.city}</option>
          ))}
        </select>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })} className={inputClass}>
          {platformCategories.map((cat) => (
            <option key={cat.id} value={cat.eventCategory}>{cat.emoji} {cat.label}</option>
          ))}
        </select>
        <textarea placeholder="Description" required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
        <textarea placeholder="Programme (optionnel)" rows={2} value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} className={inputClass} />
        <input type="number" placeholder="Tarif d'entrée (GNF, optionnel)" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} className={inputClass} />
        <input type="text" placeholder="Speakers (séparés par des virgules)" value={form.speakers} onChange={(e) => setForm({ ...form, speakers: e.target.value })} className={inputClass} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700">
          Annuler
        </button>
        <button type="submit" className="rounded-xl bg-loop-black py-2.5 text-sm font-bold text-white">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
