import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { FormSelectChip } from '@/components/FormSelectChip';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { getCountryLabel, type CountryCode } from '@/lib/countries';
import {
  CONTENT_LOCATION_NA_LABEL,
  type ContentLocationMode,
} from '@/lib/content-location-utils';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  mode: ContentLocationMode;
  onModeChange: (mode: ContentLocationMode) => void;
  value: string;
  onChange: (value: string, meta?: import('@/lib/guinea-locations').GuineaLocationPickMeta) => void;
  shell: ShellTheme;
  countryCode: CountryCode;
  chipVariant?: 'primary' | 'admin' | 'tool';
  disabled?: boolean;
}

export function ContentLocationFields({
  mode,
  onModeChange,
  value,
  onChange,
  shell,
  countryCode,
  chipVariant = 'primary',
  disabled = false,
}: Props) {
  const physicalDraftRef = useRef(value);

  useEffect(() => {
    if (mode === 'physical') {
      physicalDraftRef.current = value;
    }
  }, [mode, value]);

  function selectMode(next: ContentLocationMode) {
    if (disabled) return;
    if (next === 'physical') {
      onModeChange('physical');
      if (!value.trim() && physicalDraftRef.current.trim()) {
        onChange(physicalDraftRef.current);
      }
      return;
    }
    if (mode === 'physical' && value.trim()) {
      physicalDraftRef.current = value;
    }
    onModeChange(next);
  }

  function handlePhysicalChange(next: string, meta?: import('@/lib/guinea-locations').GuineaLocationPickMeta) {
    physicalDraftRef.current = next;
    onChange(next, meta);
  }

  const pickerDisabled = disabled;
  const pickerValue = mode === 'physical' ? value : physicalDraftRef.current;

  return (
    <View>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: shell.pageKicker, marginBottom: 6, marginTop: 8 }}>
        Localisation (optionnel)
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <FormSelectChip
          label="Adresse"
          selected={mode === 'physical'}
          onPress={() => selectMode('physical')}
          shell={shell}
          variant={chipVariant}
        />
        <FormSelectChip
          label="En ligne"
          selected={mode === 'online'}
          onPress={() => selectMode('online')}
          shell={shell}
          variant={chipVariant}
        />
        <FormSelectChip
          label="N/A"
          selected={mode === 'na'}
          onPress={() => selectMode('na')}
          shell={shell}
          variant={chipVariant}
        />
      </View>

      <GuineaLocationPicker
        value={pickerValue}
        onChange={(next, meta) => {
          if (mode !== 'physical') {
            handlePhysicalChange(next, meta);
            onModeChange('physical');
            return;
          }
          handlePhysicalChange(next, meta);
        }}
        shell={shell}
        label="Commune et quartier"
        countryCode={countryCode}
        optional
        disabled={pickerDisabled}
        placeholder={
          mode === 'physical'
            ? 'Choisir commune et quartier…'
            : 'Appuyez pour choisir commune et quartier…'
        }
      />

      {mode !== 'physical' ? (
        <Text style={{ fontSize: 12, lineHeight: 18, color: shell.pageKicker, marginBottom: 8, fontStyle: 'italic' }}>
          {mode === 'online'
            ? 'Contenu en ligne — touchez le champ ci-dessus pour ajouter une adresse physique.'
            : 'Touchez le champ ci-dessus pour renseigner une adresse.'}
        </Text>
      ) : null}

      {mode === 'online' ? (
        <Text style={{ fontSize: 12, lineHeight: 18, color: shell.pageKicker, marginBottom: 8, fontStyle: 'italic' }}>
          Contenu en ligne — pays : {getCountryLabel(countryCode)} (modifiable via « Pays du contenu »).
        </Text>
      ) : null}

      {mode === 'na' ? (
        <Text style={{ fontSize: 12, lineHeight: 18, color: shell.pageKicker, marginBottom: 8, fontStyle: 'italic' }}>
          {CONTENT_LOCATION_NA_LABEL}.
        </Text>
      ) : null}
    </View>
  );
}
