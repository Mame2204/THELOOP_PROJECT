import { useEffect } from 'react';
import type { SharePayload } from '@/lib/share-utils';
import { copyShareLink, shareViaMail, shareViaMessenger, shareViaSms, shareViaWhatsApp } from '@/lib/share-utils';

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  payload: SharePayload;
}

const OPTIONS = [
  { id: 'whatsapp', label: 'WhatsApp', emoji: '💬', action: shareViaWhatsApp },
  { id: 'messenger', label: 'Messenger', emoji: '📨', action: shareViaMessenger },
  { id: 'sms', label: 'Message', emoji: '📱', action: shareViaSms },
  { id: 'mail', label: 'Mail', emoji: '✉️', action: shareViaMail },
] as const;

export function ShareSheet({ open, onClose, payload }: ShareSheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Partager"
      >
        <p className="text-sm font-bold text-loop-black">Partager via</p>
        <p className="mt-1 truncate text-xs text-neutral-500">{payload.title}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                opt.action(payload);
                onClose();
              }}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-3 text-left text-sm font-semibold text-loop-black hover:bg-neutral-50"
            >
              <span>{opt.emoji}</span>
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            copyShareLink(payload);
            onClose();
          }}
          className="mt-2 w-full rounded-xl border border-dashed border-neutral-300 py-2.5 text-xs font-semibold text-neutral-600"
        >
          Copier le lien
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-xs font-medium text-neutral-500">
          Annuler
        </button>
      </div>
    </div>
  );
}
