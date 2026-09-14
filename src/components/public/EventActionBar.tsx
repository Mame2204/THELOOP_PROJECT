import { useState } from 'react';

import type { Event } from '@/types';

import { ShareSheet } from '@/components/public/ShareSheet';

import { addEventToCalendar, getEventSharePayload } from '@/lib/event-actions';



interface EventActionBarProps {

  event: Event;

}



export function EventActionBar({ event }: EventActionBarProps) {

  const [shareOpen, setShareOpen] = useState(false);

  const payload = getEventSharePayload(event);



  return (

    <>

      <div className="grid grid-cols-2 gap-2">

        <button

          type="button"

          onClick={() => addEventToCalendar(event)}

          className="flex items-center justify-center gap-2 rounded-xl border border-loop-public-border bg-loop-public-surface py-3 text-xs font-semibold text-loop-public-text transition-colors hover:bg-loop-public-bg"

        >

          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

            <rect x="3" y="4" width="18" height="18" rx="2" />

            <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />

          </svg>

          Calendrier

        </button>

        <button

          type="button"

          onClick={() => setShareOpen(true)}

          className="flex items-center justify-center gap-2 rounded-xl border border-loop-public-border bg-loop-public-surface py-3 text-xs font-semibold text-loop-public-text transition-colors hover:bg-loop-public-bg"

        >

          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

            <circle cx="18" cy="5" r="3" />

            <circle cx="6" cy="12" r="3" />

            <circle cx="18" cy="19" r="3" />

            <path d="M8.6 13.5l6.8 3.9M15.4 6.6l-6.8 3.9" strokeLinecap="round" />

          </svg>

          Partager

        </button>

      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} payload={payload} />

    </>

  );

}


