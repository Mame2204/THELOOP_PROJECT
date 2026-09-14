import { usePartnerData } from '@/hooks/usePartnerData';

export function PartnerCategoriesSection() {
  const { platformCategories } = usePartnerData();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-300 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-loop-black">Catégories plateforme</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Catégories gérées par l&apos;administrateur THE LOOP. Utilisez-les pour classer vos événements.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {platformCategories.length === 0 ? (
          <p className="w-full rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
            Aucune catégorie disponible. Contactez l&apos;administrateur.
          </p>
        ) : (
          platformCategories.map((cat) => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-loop-black shadow-sm"
            >
              <span className="text-base">{cat.emoji}</span>
              {cat.label}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
