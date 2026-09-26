import { useId, useState } from 'react';

const MAX_DATA_URL_BYTES = 1_500_000;

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  hint?: string;
};

/** URL distante ou fichier local (data URL) — aligné besoin Accueil / logos. */
export function ImageOrUrlField({ label, value, onChange, disabled, hint }: Props) {
  const inputId = useId();
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {hint ? <p className="meta" style={{ marginTop: 0 }}>{hint}</p> : null}
      <input
        id={inputId}
        type="url"
        value={value.startsWith('data:') ? '' : value}
        placeholder="https://… ou choisir un fichier ci-dessous"
        disabled={disabled}
        onChange={(e) => {
          setFileError(null);
          onChange(e.target.value);
        }}
      />
      <input
        type="file"
        accept="image/*"
        disabled={disabled}
        style={{ marginTop: 8 }}
        onChange={(e) => {
          setFileError(null);
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > MAX_DATA_URL_BYTES) {
            setFileError('Image trop lourde (max ~1,5 Mo). Utilisez une URL hébergée.');
            e.target.value = '';
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            if (result) onChange(result);
          };
          reader.onerror = () => setFileError('Lecture du fichier impossible.');
          reader.readAsDataURL(file);
        }}
      />
      {value.startsWith('data:') ? (
        <p className="meta" style={{ marginTop: 6 }}>
          Fichier local sélectionné ({Math.round(value.length / 1024)} Ko en base64)
        </p>
      ) : null}
      {fileError ? <p className="error-text">{fileError}</p> : null}
      {value ? (
        <img
          src={value}
          alt=""
          style={{ marginTop: 8, maxWidth: 120, maxHeight: 80, objectFit: 'contain', borderRadius: 6 }}
        />
      ) : null}
    </div>
  );
}
