import { DEV_GRADE_OPTIONS, type DevGradeOverride } from '@/lib/member-grade-theme';

interface DevGradeThemeSelectProps {
  value: DevGradeOverride;
  sessionGrade: string;
  onChange: (value: DevGradeOverride) => void;
}

/** Prévisualisation des thèmes par grade — visible uniquement en mode développement. */
export function DevGradeThemeSelect({ value, sessionGrade, onChange }: DevGradeThemeSelectProps) {
  if (!import.meta.env.DEV) return null;

  return (
    <div className="rounded-xl border border-dashed border-violet-400/60 bg-violet-50/80 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
        Dev · Prévisualisation des grades
      </p>
      <p className="mt-1 text-xs text-violet-600/80">
        Grade session actuel : <span className="font-semibold">{sessionGrade}</span>
      </p>
      <label className="mt-3 block">
        <span className="sr-only">Forcer le thème visuel</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as DevGradeOverride)}
          className="mt-1 w-full rounded-xl border border-violet-300 bg-white px-3 py-2.5 text-sm text-violet-900 outline-none focus:border-violet-500"
        >
          {DEV_GRADE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
