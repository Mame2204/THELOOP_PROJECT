import { useEffect, useState } from 'react';
import {
  KIND_LABELS,
  listPublishedForPicker,
  type CatalogContentItem,
  type CatalogKind,
} from '../lib/content';
import { resolveMemberContentSlug } from '../lib/content-slugs';

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
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listPublishedForPicker(countryCode, kind, query).then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTruncated(res.truncated);
        setLoading(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [countryCode, kind, query]);

  useEffect(() => {
    if (value && allowedKinds.includes(value.targetType)) {
      setKind(value.targetType);
    }
  }, [value, allowedKinds]);

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
      {truncated ? <p className="meta">Affinez la recherche pour voir la suite.</p> : null}
      <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
        {items.map((item) => (
          <button
            key={`${item.kind}-${item.id}`}
            type="button"
            className="btn ghost small"
            style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 0 }}
            onClick={() => {
              void (async () => {
                const resolved = await resolveMemberContentSlug(countryCode, item.kind, item.id);
                onChange({
                  targetType: item.kind,
                  targetId: item.id,
                  targetSlug: resolved?.slug ?? item.id,
                  title: resolved?.label ?? item.title,
                });
              })();
            }}
          >
            {item.title}
            {item.subtitle ? <span className="meta"> · {item.subtitle}</span> : null}
          </button>
        ))}
        {!loading && items.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>
            Aucun contenu publié.
          </p>
        ) : null}
      </div>
    </div>
  );
}
