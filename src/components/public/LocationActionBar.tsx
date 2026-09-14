import { useState } from 'react';

import type { HomeLocation } from '@/lib/demo-data';

import { ShareSheet } from '@/components/public/ShareSheet';

import { formatFavoriteCount, getLocationSharePayload } from '@/lib/location-actions';

import { useFavorites } from '@/hooks/useFavorites';



interface LocationActionBarProps {

  location: HomeLocation;

}



export function LocationActionBar({ location }: LocationActionBarProps) {

  const { isLocationFavorite, toggleLocationFavorite } = useFavorites();

  const [shareOpen, setShareOpen] = useState(false);

  const isActive = isLocationFavorite(location.id);

  const payload = getLocationSharePayload(location);



  async function handleSave() {

    await toggleLocationFavorite(location.id);

  }



  return (

    <>

      <div className="grid grid-cols-2 gap-2">

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

        <button

          type="button"

          onClick={() => void handleSave()}

          aria-pressed={isActive}

          className={`flex items-center justify-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition-colors ${

            isActive

              ? 'border-loop-gold bg-loop-gold/10 text-loop-gold'

              : 'border-loop-public-border bg-loop-public-surface text-loop-public-text hover:bg-loop-public-bg'

          }`}

        >

          <span className={isActive ? 'text-loop-gold' : 'text-red-400'}>{isActive ? '♥' : '♡'}</span>

          <span>{isActive ? 'Sauvegardé' : 'Sauvegarder'}</span>

          <span className="text-loop-public-muted">· {formatFavoriteCount(location.favoriteCount)}</span>

        </button>

      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} payload={payload} />

    </>

  );

}


