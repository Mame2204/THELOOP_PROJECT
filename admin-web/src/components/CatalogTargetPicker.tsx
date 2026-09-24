import { useCallback, useEffect, useState } from 'react';
import {
  CATALOG_PICKER_LIMIT,
  KIND_LABELS,
  listCatalogContent,
  type CatalogContentItem,
  type CatalogKind,
} from '../lib/content';

export type CatalogTargetType = 'event' | 'spot' | 'tool';

export interface CatalogTargetSelection {
  targetType: CatalogTargetType;
  targetId: string;
  targetSlug: string;
  title: string;
}

type Props = {
  countryCode: string;
  value: CatalogTargetSelection | null;
  onChange: (next: CatalogTargetSelection | null) => void;
  allowedKinds?: CatalogTargetType[];
  label?: string;
};

export function CatalogTargetPicker({
  countryCode,
  value,
  onChange,
  allowedKinds = ['event', 'spot', 'tool'],
  label = 'Contenu lié',
}: Props) {
  const [kind, setKind] = useState<CatalogKind>(allowedKinds[0] ?? 'event');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogContentItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listCatalogContent(countryCode, [kind], {
      pageSize: CATALOG_PICKER_LIMIT,
      status: 'published',
    });
    setItems(res.items);
    setLoading(false);
  }, [countryCode, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((i) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return i.title.toLowerCase().includes(q) || (i.subtitle ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="field">
      <label>{label}</label>
      {value ? (
        <div className="card" style={{ padding: 10, marginBottom: 8 }}>
          <strong>{value.title}</strong>
          <span className="meta"> · {KIND_LABELS[value.targetType]}</span>
          <button
            type="button"
            className="btn small ghost"
            style={{ marginLeft: 8 }}
            onClick={() => onChange(null)}
          >
            Effacer
          </button>
        </div>
      ) : null}
      <div className="tabs" style={{ marginBottom: 8 }}>
        {allowedKinds.map((k) => (
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
        placeholder="Rechercher…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8, width: '100%' }}
      />
      {loading ? <p className="muted">Chargement…</p> : null}
      <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
        {filtered.slice(0, 40).map((item) => (
          <button
            key={`${item.kind}-${item.id}`}
            type="button"
            className="btn ghost small"
            style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0 }}
            onClick={() =>
              onChange({
                targetType: item.kind,
                targetId: item.id,
                targetSlug: item.id,
                title: item.title,
              })
            }
          >
            {item.title}
            {item.subtitle ? <span className="meta"> · {item.subtitle}</span> : null}
          </button>
        ))}
        {!loading && filtered.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>
            Aucun contenu publié.
          </p>
        ) : null}
      </div>
    </div>
  );
}
