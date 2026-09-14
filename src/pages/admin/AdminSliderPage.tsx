import { useMemo, useState } from 'react';
import { resolveHeroBanner, getHighlightableEvents, getHighlightableLocations } from '@/lib/demo-data';
import { useAdminData } from '@/hooks/useAdminData';

export function AdminSliderPage() {
  const { store, toggleHeroBanner, addHeroBannerRef, removeHeroBanner } = useAdminData();
  const [targetType, setTargetType] = useState<'event' | 'location'>('event');
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const events = useMemo(() => getHighlightableEvents(), []);
  const locations = useMemo(() => getHighlightableLocations(), []);

  const featuredKeys = useMemo(
    () => new Set(store.heroBanners.map((banner) => `${banner.targetType}:${banner.targetId}`)),
    [store.heroBanners],
  );

  const availableEvents = useMemo(
    () => events.filter((item) => !featuredKeys.has(`event:${item.id}`)),
    [events, featuredKeys],
  );
  const availableLocations = useMemo(
    () => locations.filter((item) => !featuredKeys.has(`location:${item.id}`)),
    [locations, featuredKeys],
  );
  const options = targetType === 'event' ? availableEvents : availableLocations;

  const resolvedBanners = store.heroBanners
    .map((banner) => ({ banner, resolved: resolveHeroBanner(banner) }))
    .filter((item) => item.resolved !== null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!targetId) {
      setError('Sélectionnez un contenu à mettre en avant.');
      return;
    }
    const created = addHeroBannerRef(targetType, targetId);
    if (!created) {
      setError('Ce contenu est déjà dans le slider.');
      return;
    }
    setTargetId('');
  }

  return (
    <div className="px-4 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-loop-gold">Accueil public</p>
        <h1 className="mt-1 text-2xl font-bold text-loop-black">Gestion du Slider Hero</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Mise en avant d&apos;événements ou lieux déjà publiés — le clic ouvre la fiche détail existante.
        </p>
      </header>

      <form onSubmit={handleAdd} className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-loop-black">+ Ajouter à la une</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as 'event' | 'location');
              setTargetId('');
            }}
            className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
          >
            <option value="event">Événement publié</option>
            <option value="location">Lieu publié</option>
          </select>
          <select
            required
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black sm:col-span-2"
          >
            <option value="">Choisir dans la liste…</option>
            {options.length === 0 ? (
              <option value="" disabled>Tous les contenus sont déjà à la une</option>
            ) : (
              options.map((item) => (
                <option key={item.id} value={item.id}>
                  {'title' in item ? item.title : item.name}
                </option>
              ))
            )}
          </select>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button type="submit" className="mt-3 rounded-xl bg-loop-black px-4 py-2.5 text-xs font-bold text-white">
          Ajouter au slider
        </button>
      </form>

      <ul className="space-y-3">
        {resolvedBanners.map(({ banner, resolved }) => (
          <li
            key={banner.id}
            className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm"
          >
            <img src={resolved!.imageUrl} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-loop-black">{resolved!.title}</p>
              <p className="truncate text-xs text-neutral-500">{resolved!.subtitle}</p>
              <p className="truncate text-[10px] text-neutral-400">
                {banner.targetType === 'event' ? 'Événement' : 'Lieu'} · {resolved!.linkUrl}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={banner.isActive}
                onClick={() => toggleHeroBanner(banner.id)}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  banner.isActive ? 'bg-loop-gold' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                    banner.isActive ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => removeHeroBanner(banner.id)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
              >
                Retirer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
