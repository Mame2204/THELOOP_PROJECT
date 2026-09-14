interface FilterPillsProps<T extends string> {
  options: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  activeClassName?: string;
  inactiveClassName?: string;
}

export function FilterPills<T extends string>({
  options,
  active,
  onChange,
  activeClassName = 'bg-loop-black text-white shadow-sm',
  inactiveClassName = 'border border-loop-public-border bg-loop-public-surface text-loop-public-text hover:border-loop-black',
}: FilterPillsProps<T>) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
      {options.map((opt) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`touch-press shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 ${
              isActive ? activeClassName : inactiveClassName
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
