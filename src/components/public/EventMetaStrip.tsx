import type { Event } from '@/types';
import {
  formatEventDate,
  formatEventPrice,
  formatEventTimeRange,
} from '@/lib/event-actions';

function IconCalendar({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-loop-public-muted">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
    </svg>
  );
}

function IconClock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-loop-public-muted">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function IconPin({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-loop-public-muted">
      <path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" strokeLinecap="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function IconTicket({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-loop-gold">
      <path d="M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
      <path d="M9 8v8M15 8v8" strokeLinecap="round" strokeDasharray="2 2" />
    </svg>
  );
}

interface EventMetaStripProps {
  event: Event;
  variant?: 'default' | 'compact' | 'inline';
}

export function EventMetaStrip({ event, variant = 'default' }: EventMetaStripProps) {
  const items = [
    { icon: <IconCalendar size={variant === 'inline' ? 12 : 14} />, label: 'Date', value: formatEventDate(event) },
    { icon: <IconClock size={variant === 'inline' ? 12 : 14} />, label: 'Heure', value: formatEventTimeRange(event) },
    { icon: <IconPin size={variant === 'inline' ? 12 : 14} />, label: 'Lieu', value: event.venueName },
    {
      icon: <IconTicket size={variant === 'inline' ? 12 : 14} />,
      label: 'Tarif',
      value: formatEventPrice(event),
      highlight: true,
    },
  ];

  if (variant === 'inline') {
    return (
      <div className="grid grid-cols-4 gap-1 px-2 py-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg bg-loop-public-bg px-1 py-1.5 text-center">
            {item.icon}
            <p
              className={`w-full truncate text-[9px] font-semibold leading-tight ${
                item.highlight ? 'text-loop-gold' : 'text-loop-public-text'
              }`}
              title={item.value}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    );
  }

  const isCompact = variant === 'compact';

  return (
    <div className={`grid grid-cols-2 ${isCompact ? 'gap-1.5 p-2' : 'gap-2 p-3'}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex items-start gap-2 rounded-xl bg-loop-public-bg ${
            isCompact ? 'px-2.5 py-2' : 'px-3 py-2.5'
          }`}
        >
          {item.icon}
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wide text-loop-public-muted">
              {item.label}
            </p>
            <p
              className={`mt-0.5 truncate font-semibold leading-tight ${
                isCompact ? 'text-[11px]' : 'text-xs'
              } ${item.highlight ? 'text-loop-gold' : 'text-loop-public-text'}`}
            >
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
