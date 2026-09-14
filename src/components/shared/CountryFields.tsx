import {
  COUNTRY_LABELS,
  LOOP_COUNTRIES,
  getCountry,
  getCountryLabel,
  phoneHint,
  type CountryCode,
} from '@/lib/countries';

interface Props {
  countryCode: CountryCode;
  onCountryChange: (code: CountryCode) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  label?: string;
}

export function CountryPhoneField({
  countryCode,
  onCountryChange,
  phone,
  onPhoneChange,
  label = 'Téléphone',
}: Props) {
  const country = getCountry(countryCode);

  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-loop-public-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          value={countryCode}
          onChange={(e) => onCountryChange(e.target.value as CountryCode)}
          className="min-w-[7.5rem] rounded-xl border border-loop-public-border bg-loop-public-bg px-2 py-3 text-sm font-bold text-loop-public-text outline-none focus:border-loop-black"
          aria-label="Indicatif pays"
        >
          {LOOP_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} +{c.callingCode}
            </option>
          ))}
        </select>
        <input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder={phoneHint(countryCode).replace(`+${country.callingCode} `, '')}
          className="w-full rounded-xl border border-loop-public-border bg-loop-public-bg px-4 py-3 text-sm text-loop-public-text outline-none focus:border-loop-black"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-loop-public-muted">
        Pays du compte : {getCountryLabel(countryCode)}
      </p>
    </div>
  );
}

interface CountrySelectProps {
  value: CountryCode;
  onChange: (code: CountryCode) => void;
  label?: string;
}

export function CountrySelectField({ value, onChange, label = 'Pays' }: CountrySelectProps) {
  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-loop-public-muted">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {LOOP_COUNTRIES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => onChange(c.code)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[10px] font-bold ${
              value === c.code
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-loop-public-border bg-loop-public-bg text-loop-public-text'
            }`}
          >
            <span>{c.flag}</span>
            <span>{COUNTRY_LABELS[c.code]}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-loop-public-muted">Sélection : {getCountryLabel(value)}</p>
    </div>
  );
}
