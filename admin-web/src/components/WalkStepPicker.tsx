import { useEffect, useState } from 'react';
import {
  KIND_LABELS,
  listPublishedForPicker,
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
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listPublishedForPicker(countryCode, kind, query).then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTruncated(res.truncated);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [countryCode, kind, query]);

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
      {truncated ? <p className="meta">Affinez la recherche pour voir la suite.</p> : null}
      <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
        {items.map((item) => {
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
