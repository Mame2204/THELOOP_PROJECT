import { useState } from 'react';

interface RejectReasonModalProps {
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function RejectReasonModal({
  title,
  subtitle,
  confirmLabel = 'Confirmer le refus',
  onClose,
  onConfirm,
}: RejectReasonModalProps) {
  const [reason, setReason] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold text-loop-black">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>}
        <label className="mt-4 block">
          <span className="text-xs font-semibold text-neutral-500">Motif du refus (visible par le créateur)</span>
          <textarea
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Expliquez ce qui doit être corrigé avant resoumission…"
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
          />
        </label>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold"
          >
            Annuler
          </button>
          <button type="submit" className="rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
