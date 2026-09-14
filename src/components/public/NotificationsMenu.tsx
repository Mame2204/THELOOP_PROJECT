import { useEffect, useRef, useState } from 'react';
import { DEMO_NOTIFICATIONS, formatNotificationDate } from '@/lib/demo-notifications';
import { useMemberTheme } from '@/hooks/useMemberTheme';

function IconBell({ stroke }: { stroke: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" />
    </svg>
  );
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(DEMO_NOTIFICATIONS);
  const rootRef = useRef<HTMLDivElement>(null);
  const { shell } = useMemberTheme();

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} non lues` : ''}`}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-white transition-colors ${shell.bellBtn}`}
      >
        <IconBell stroke={shell.bellStroke} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-700 bg-loop-black shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[10px] font-semibold text-loop-gold hover:underline"
              >
                Tout marquer lu
              </button>
            )}
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={`border-b border-neutral-800 px-4 py-3 last:border-b-0 ${
                  notification.read ? 'opacity-70' : 'bg-neutral-900/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  {!notification.read && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: shell.bellStroke }}
                    />
                  )}
                  <div className={notification.read ? '' : 'min-w-0 flex-1 pl-0'}>
                    <p className="text-sm font-semibold text-white">{notification.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{notification.body}</p>
                    <p className="mt-1 text-[10px] text-neutral-500">
                      {formatNotificationDate(notification.createdAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
