import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';

interface FavoriteButtonProps {
  type: 'event' | 'location';
  itemId: string;
  className?: string;
  variant?: 'default' | 'light' | 'overlay';
}

const VARIANTS = {
  default: {
    active: 'border-loop-gold bg-loop-gold/20 text-loop-gold',
    inactive: 'border-loop-public-border bg-loop-public-surface text-loop-public-muted hover:border-loop-gold hover:text-loop-gold',
  },
  light: {
    active: 'border-white bg-white/20 text-white',
    inactive: 'border-white/40 bg-black/20 text-white/90 hover:bg-black/40 backdrop-blur-sm',
  },
  overlay: {
    active: 'border-loop-gold bg-loop-gold/90 text-loop-black',
    inactive: 'border-white/30 bg-black/40 text-white backdrop-blur-sm hover:bg-black/60',
  },
};

export function FavoriteButton({
  type,
  itemId,
  className = '',
  variant = 'default',
}: FavoriteButtonProps) {
  const { role } = useAuth();
  const {
    isEventFavorite,
    isLocationFavorite,
    toggleEventFavorite,
    toggleLocationFavorite,
    openAuthModal,
  } = useFavorites();

  const isAnonymous = role === 'USER_ANONYMOUS';
  const isActive = type === 'event' ? isEventFavorite(itemId) : isLocationFavorite(itemId);
  const styles = VARIANTS[variant];

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isAnonymous) {
      openAuthModal();
      return;
    }
    if (type === 'event') {
      await toggleEventFavorite(itemId);
    } else {
      await toggleLocationFavorite(itemId);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isActive ? 'Retirer des favoris' : 'Enregistrer dans les favoris'}
      aria-pressed={isActive}
      className={`touch-press flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors ${
        isActive ? styles.active : styles.inactive
      } ${className}`}
    >
      {isActive ? '♥' : '♡'}
    </button>
  );
}
