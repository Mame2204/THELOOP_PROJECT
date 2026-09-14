import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormTextInput } from '@/components/FormTextInput';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  formatDaysCompact,
  formatHoursModeFromSettings,
  type HoursMode,
  type WeeklyHoursSlot,
} from '@/lib/opening-hours';
import {
  defaultOpeningHoursSettings,
  getOpeningHoursSettings,
  resolvePresetSlots,
  type OpeningHoursPresetConfig,
  type OpeningHoursSettings,
} from '@/lib/opening-hours-settings-store';
import { FormSelectChip } from '@/components/FormSelectChip';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  mode: HoursMode;
  slots: WeeklyHoursSlot[];
  onModeChange: (mode: HoursMode) => void;
  onSlotsChange: (slots: WeeklyHoursSlot[]) => void;
  onFormattedChange?: (label: string) => void;
  shell: { pageTitle: string; pageKicker: string; filterInactiveBg: string; filterInactiveBorder: string; tabIndicator?: string; pageBg?: string };
  accentColor?: string;
  chipVariant?: 'primary' | 'admin';
}

function normalizeSlotsKey(slots: WeeklyHoursSlot[]): string {
  return JSON.stringify(
    slots
      .map((slot) => ({
        days: [...slot.days].sort((a, b) => a - b),
        openTime: slot.openTime.trim(),
        closeTime: slot.closeTime.trim(),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

function findMatchingPresetId(
  slots: WeeklyHoursSlot[],
  presets: OpeningHoursPresetConfig[],
  config: OpeningHoursSettings,
): string | null {
  if (!slots.length) return null;
  const target = normalizeSlotsKey(slots);
  for (const preset of presets) {
    const resolved = resolvePresetSlots(preset, config);
    if (normalizeSlotsKey(resolved) === target) return preset.id;
  }
  return null;
}

function previewLabel(
  mode: HoursMode,
  slots: WeeklyHoursSlot[],
  config: OpeningHoursSettings,
): string {
  if (mode === 'weekly' && !slots.length) return '—';
  return formatHoursModeFromSettings(mode, slots, {
    always_open: config.modes.always_open.label,
    by_appointment: config.modes.by_appointment.label,
  });
}

export function OpeningHoursEditor({
  mode,
  slots,
  onModeChange,
  onSlotsChange,
  onFormattedChange,
  shell,
  accentColor,
  chipVariant = 'primary',
}: Props) {
  const [config, setConfig] = useState<OpeningHoursSettings>(defaultOpeningHoursSettings());
  const accent = accentColor ?? (chipVariant === 'admin' ? '#3b82f6' : '#10b981');
  const pressRipple = chipVariant === 'admin' ? 'rgba(59,130,246,0.28)' : 'rgba(16,185,129,0.28)';

  const reloadConfig = useCallback(() => {
    void getOpeningHoursSettings().then(setConfig);
  }, []);

  useFocusLoad(
    async () => {
      reloadConfig();
    },
    { ttlMs: 300_000 },
  );

  const enabledModes = (['always_open', 'by_appointment', 'weekly'] as HoursMode[]).filter((m) => config.modes[m].enabled);
  const enabledPresets = config.presets.filter((p) => p.enabled);
  const weeklyModeLabel = config.modes.weekly.label;
  const activePresetId = useMemo(
    () => (mode === 'weekly' ? findMatchingPresetId(slots, enabledPresets, config) : null),
    [mode, slots, enabledPresets, config],
  );
  const preview = previewLabel(mode, slots, config);

  function notifyChange(modeNext: HoursMode, slotsNext: WeeklyHoursSlot[]) {
    onFormattedChange?.(previewLabel(modeNext, slotsNext, config));
  }

  function handleModeChange(next: HoursMode) {
    onModeChange(next);
    notifyChange(next, next === 'weekly' ? slots : []);
  }

  function handleSlotsChange(next: WeeklyHoursSlot[]) {
    onSlotsChange(next);
    notifyChange('weekly', next);
  }

  function applyConfiguredPreset(preset: OpeningHoursSettings['presets'][number]) {
    const nextSlots = resolvePresetSlots(preset, config);
    onModeChange('weekly');
    onSlotsChange(nextSlots);
    notifyChange('weekly', nextSlots);
  }

  function updateSlot(slotId: string, patch: Partial<WeeklyHoursSlot>) {
    handleSlotsChange(slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)));
  }

  return (
    <View style={[styles.wrapper, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
      <Text style={[styles.help, { color: shell.pageKicker }]}>
        1. Choisissez un mode · 2. En « {weeklyModeLabel} », cliquez un raccourci
      </Text>

      <View style={styles.modeRow}>
        {enabledModes.map((m) => {
          const selected = mode === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              android_ripple={{ color: selected ? 'rgba(0,0,0,0.12)' : pressRipple }}
              style={({ pressed }) => [
                styles.modeBtn,
                {
                  borderColor: selected ? accent : pressed ? accent : shell.filterInactiveBorder,
                  backgroundColor: selected ? accent : pressed ? `${accent}22` : shell.pageBg ?? shell.filterInactiveBg,
                  borderWidth: selected ? 2 : 1,
                  opacity: pressed && !selected ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              onPress={() => handleModeChange(m)}
            >
              <Text style={{ color: selected ? '#fff' : shell.pageTitle, fontSize: 12, fontWeight: '700' }}>
                {selected ? '✓ ' : ''}{config.modes[m].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'weekly' ? (
        <>
          {enabledPresets.length > 0 ? (
            <>
              <Text style={[styles.hint, { color: shell.pageKicker }]}>Raccourcis</Text>
              <View style={styles.presetRow}>
                {enabledPresets.map((preset) => (
                  <FormSelectChip
                    key={preset.id}
                    label={preset.label}
                    selected={activePresetId === preset.id}
                    onPress={() => applyConfiguredPreset(preset)}
                    shell={shell as ShellTheme}
                    size="md"
                    variant={chipVariant}
                  />
                ))}
              </View>
            </>
          ) : null}

          {slots.map((slot) => (
            <View
              key={slot.id}
              style={[
                styles.slotBlock,
                {
                  borderColor: activePresetId ? accent : shell.filterInactiveBorder,
                  backgroundColor: activePresetId ? `${accent}11` : shell.pageBg ?? 'transparent',
                  borderWidth: activePresetId ? 2 : 1,
                },
              ]}
            >
              <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 6 }]}>
                Jours : {formatDaysCompact(slot.days)}
              </Text>
              <View style={styles.timeRow}>
                <FormTextInput
                  shell={shell as ShellTheme}
                  accentColor={accent}
                  style={styles.timeInput}
                  value={slot.openTime}
                  onChangeText={(openTime) => updateSlot(slot.id, { openTime })}
                  placeholder={config.defaultOpenTime}
                  placeholderTextColor={shell.pageKicker}
                />
                <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>→</Text>
                <FormTextInput
                  shell={shell as ShellTheme}
                  accentColor={accent}
                  style={styles.timeInput}
                  value={slot.closeTime}
                  onChangeText={(closeTime) => updateSlot(slot.id, { closeTime })}
                  placeholder={config.defaultCloseTime}
                  placeholderTextColor={shell.pageKicker}
                />
              </View>
            </View>
          ))}

          {slots.length === 0 ? (
            <Text style={[styles.emptyHint, { color: shell.pageKicker }]}>
              Sélectionnez un raccourci pour définir les jours et heures.
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.emptyHint, { color: shell.pageKicker }]}>
          Les raccourcis s'affichent uniquement en mode « {weeklyModeLabel} ».
        </Text>
      )}

      <View style={[styles.previewBox, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.pageBg ?? 'transparent' }]}>
        <Text style={[styles.previewLabel, { color: shell.pageKicker }]}>Aperçu fiche spot</Text>
        <Text style={[styles.previewValue, { color: shell.pageTitle }]}>
          {preview === '—' ? 'Non renseigné' : preview}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderWidth: 1, borderRadius: 12, padding: 12 },
  help: { fontSize: 11, lineHeight: 16, marginBottom: 10 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, minHeight: 44, justifyContent: 'center' },
  hint: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  slotBlock: { borderRadius: 10, padding: 10, marginBottom: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, marginBottom: 0, paddingVertical: 12, fontSize: 14 },
  emptyHint: { fontSize: 12, lineHeight: 17, marginBottom: 8, fontStyle: 'italic' },
  previewBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 4 },
  previewLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  previewValue: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
});
