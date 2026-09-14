import { useState } from 'react';
import type { EventCategory } from '@/types';
import { EVENT_CATEGORY_LABELS } from '@/types';
import { PLATFORM_CATEGORY_ICONS } from '@/lib/category-icons';
import { useAdminData } from '@/hooks/useAdminData';

export function AdminCategoriesPage() {
  const { store, createCategory, updateCategory, deleteCategory } = useAdminData();
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState(PLATFORM_CATEGORY_ICONS[0]);
  const [eventCategory, setEventCategory] = useState<EventCategory>('corporate');
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', emoji: '', eventCategory: 'corporate' as EventCategory });

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="text-2xl font-bold text-loop-black">Catégories plateforme</h1>
      <p className="mt-1 text-sm text-neutral-600">Gérées par l&apos;admin · utilisées par tous les partenaires</p>

      <form
        className="mt-6 max-w-xl rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          createCategory({ label: label.trim(), emoji, eventCategory });
          setLabel('');
        }}
      >
        <h2 className="text-sm font-bold">Nouvelle catégorie</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="flex flex-wrap gap-1">
            {PLATFORM_CATEGORY_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setEmoji(icon)}
                className={`h-9 w-9 rounded-lg border text-lg ${emoji === icon ? 'border-loop-gold bg-loop-gold/10' : 'border-neutral-200'}`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nom de la catégorie"
          className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={eventCategory}
          onChange={(e) => setEventCategory(e.target.value as EventCategory)}
          className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
        >
          {(Object.keys(EVENT_CATEGORY_LABELS) as EventCategory[]).map((cat) => (
            <option key={cat} value={cat}>{EVENT_CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
        <button type="submit" className="mt-3 rounded-xl bg-loop-black px-4 py-2 text-xs font-bold text-white">
          Créer
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {store.platformCategories.map((cat) => (
          <div key={cat.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4">
            {editId === cat.id ? (
              <form
                className="flex w-full flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateCategory(cat.id, editForm);
                  setEditId(null);
                }}
              >
                <div className="flex flex-wrap gap-1">
                  {PLATFORM_CATEGORY_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, emoji: icon })}
                      className={`h-8 w-8 rounded border text-sm ${editForm.emoji === icon ? 'border-loop-gold' : 'border-neutral-200'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <input value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} className="min-w-[140px] flex-1 rounded-lg border px-2 py-1 text-sm" />
                <button type="submit" className="text-xs font-bold text-green-700">OK</button>
                <button type="button" onClick={() => setEditId(null)} className="text-xs text-neutral-500">Annuler</button>
              </form>
            ) : (
              <>
                <span className="text-lg font-medium">{cat.emoji} {cat.label}</span>
                <span className="text-xs text-neutral-500">{EVENT_CATEGORY_LABELS[cat.eventCategory]}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditId(cat.id); setEditForm({ label: cat.label, emoji: cat.emoji, eventCategory: cat.eventCategory }); }} className="text-xs font-bold text-loop-black">Modifier</button>
                  <button type="button" onClick={() => deleteCategory(cat.id)} className="text-xs font-bold text-red-600">Supprimer</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
