import { useFavorites } from '@/hooks/useFavorites';
import { useMemberGrade } from '@/hooks/useMemberGrade';

interface AuthGateScreenProps {
  icon: string;
  title: string;
  description: string;
  ctaLabel?: string;
}

export function AuthGateScreen({
  icon,
  title,
  description,
  ctaLabel = 'Créer mon compte gratuit',
}: AuthGateScreenProps) {
  const { openAuthModal } = useFavorites();
  const { theme } = useMemberGrade();
  const { profile } = theme;

  return (
    <div className={`flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center ${profile.pageBg}`}>
      <span className="text-5xl">{icon}</span>
      <h2 className={`mt-5 text-xl font-bold ${profile.pageTitle}`}>{title}</h2>
      <p className={`mt-2 max-w-xs text-sm leading-relaxed ${profile.pageKicker}`}>{description}</p>
      <button
        type="button"
        onClick={openAuthModal}
        className="touch-press native-cta mt-8 w-full max-w-xs rounded-2xl bg-loop-black py-4 text-sm font-bold text-white shadow-lg active:scale-[0.97]"
      >
        {ctaLabel}
      </button>
      <button
        type="button"
        onClick={openAuthModal}
        className={`touch-press mt-3 text-xs font-semibold underline-offset-2 hover:underline ${profile.pageKicker}`}
      >
        J&apos;ai déjà un compte
      </button>
    </div>
  );
}
