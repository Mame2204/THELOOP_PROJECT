import { useCallback, useEffect, useState } from 'react';
import {
  CATALOG_PICKER_LIMIT,
  KIND_LABELS,
  listCatalogContent,
  type CatalogContentItem,
  type CatalogKind,
} from '../lib/content';
import type { WalkStepInput } from '../lib/accueil';

type Props = {
  countryCode: string;
  steps: WalkStepInput[];
  onChange: (steps: WalkStepInput[]) => void;
  maxSteps?: number;
};

export function WalkStepPicker({ countryCode, steps, onChange, maxSteps = 8 }: Props) {
  const [kind, setKind] = useState<CatalogKind>('spot');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogContentItem[]>([]);

  const load = useCallback(async () => {
    const res = await listCatalogContent(countryCode, [kind], {
      pageSize: CATALOG_PICKER_LIMIT,
      status: 'published',
    });
    setItems(res.items);
  }, [countryCode, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(item: CatalogContentItem) {
    const exists = steps.find((s) => s.targetType === item.kind && s.targetId === item.id);
    if (exists) {
      onChange(steps.filter((s) => !(s.targetType === item.kind && s.targetId === item.id)));
      return;
    }
    if (steps.length >= maxSteps) return;
    onChange([
      ...steps,
      { targetType: item.kind, targetId: item.id, title: item.title },
    ]);
  }

  const filtered = items.filter((i) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return i.title.toLowerCase().includes(q);
  });

  return (
    <div className="field">
      <label>Étapes du parcours ({steps.length}/{maxSteps})</label>
      {steps.length > 0 ? (
        <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          {steps.map((s, i) => (
            <li key={`${s.targetType}-${s.targetId}`}>
              {i + 1}. {s.title}{' '}
              <span className="meta">({KIND_LABELS[s.targetType]})</span>
              <button
                type="button"
                className="btn small ghost"
                style={{ marginLeft: 6 }}
                onClick={() =>
                  onChange(steps.filter((x) => !(x.targetType === s.targetType && x.targetId === s.targetId)))
                }
              >
                Retirer
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">Sélectionnez au moins 2 étapes ci-dessous.</p>
      )}
      <div className="tabs" style={{ marginBottom: 8 }}>
        {(['event', 'spot', 'tool'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`tab ${kind === k ? 'active' : ''}`}
            onClick={() => setKind(k)}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <input
        type="search"
        placeholder="Filtrer…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
        {filtered.slice(0, 30).map((item) => {
          const selected = steps.some((s) => s.targetType === item.kind && s.targetId === item.id);
          return (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              className={`btn small ${selected ? '' : 'ghost'}`}
              style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0 }}
              onClick={() => toggle(item)}
            >
              {selected ? '✓ ' : ''}
              {item.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
