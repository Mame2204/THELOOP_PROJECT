import { useFavorites } from '@/hooks/useFavorites';
import { useAuth } from '@/hooks/useAuth';
import { canSaveFavorites } from '@/types';

interface SaveActionButtonProps {
  type: 'event' | 'location';
  itemId: string;
  className?: string;
}

export function SaveActionButton({ type, itemId, className = '' }: SaveActionButtonProps) {
  const { role } = useAuth();
  const {
    isEventFavorite,
    isLocationFavorite,
    toggleEventFavorite,
    toggleLocationFavorite,
    openAuthModal,
  } = useFavorites();

  const canSave = canSaveFavorites(role);
  const isActive =
    type === 'event' ? isEventFavorite(itemId) : isLocationFavorite(itemId);

  async function handleClick() {
    if (!canSave) {
      openAuthModal();
      return;
    }
    if (type === 'event') await toggleEventFavorite(itemId);
    else await toggleLocationFavorite(itemId);
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-pressed={canSave && isActive}
      aria-label={canSave && isActive ? 'Retirer des favoris' : 'Sauvegarder'}
      className={`touch-press native-cta flex w-full items-center justify-center gap-2 rounded-2xl border py-4 text-sm font-bold transition-colors ${
        canSave && isActive
          ? 'border-loop-gold bg-loop-gold/15 text-loop-gold'
          : 'border-loop-public-border bg-loop-public-surface text-loop-public-text hover:bg-loop-public-bg'
      } ${canSave && isActive ? 'ring-2 ring-loop-gold/30' : ''} ${className}`}
    >
      <span className={canSave && isActive ? 'text-loop-gold' : 'text-red-400'}>
        {canSave && isActive ? '♥' : '♡'}
      </span>
      {canSave && isActive ? 'Sauvegardé' : canSave ? 'Sauvegarder' : 'Se connecter pour sauvegarder'}
    </button>
  );
}
