interface ListPagerProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  label?: string;
}

/** Pagination liste — toujours visible dès qu'il y a au moins 1 résultat. */
export function ListPager({ page, total, pageSize, onPageChange, label = 'résultats' }: ListPagerProps) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <button
        type="button"
        className="btn ghost"
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
      >
        Précédent
      </button>
      <span className="muted">
        Page {page + 1}/{pages} · {total} {label}
      </span>
      <button
        type="button"
        className="btn ghost"
        disabled={page + 1 >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        Suivant
      </button>
    </div>
  );
}
