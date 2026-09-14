import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import {
  DAY_LABELS_SHORT,
  formatDaysCompact,
  formatWeeklySchedules,
  type WeeklyHoursSlot,
} from '@/lib/opening-hours';
import type { OpeningHoursPresetConfig, OpeningHoursSettings } from '@/lib/opening-hours-settings-store';

interface Shell {
  pageTitle: string;
  pageKicker: string;
  filterInactiveBg: string;
  filterInactiveBorder: string;
  pageBg?: string;
}

interface Props {
  preset: OpeningHoursPresetConfig;
  settings: OpeningHoursSettings;
  shell: Shell;
  canDelete: boolean;
  onChange: (patch: Partial<OpeningHoursPresetConfig>) => void;
  onDelete: () => void;
}

function ensureSlots(preset: OpeningHoursPresetConfig, settings: OpeningHoursSettings): WeeklyHoursSlot[] {
  if (preset.slots.length) return preset.slots;
  return [{
    id: 'main',
    days: [2, 3, 4, 5, 6],
    openTime: settings.defaultOpenTime,
    closeTime: settings.defaultCloseTime,
  }];
}

function updateSlot(slots: WeeklyHoursSlot[], slotId: string, patch: Partial<WeeklyHoursSlot>): WeeklyHoursSlot[] {
  return slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s));
}

function toggleDayInSlot(slots: WeeklyHoursSlot[], slotId: string, day: number): WeeklyHoursSlot[] {
  const target = slots.find((s) => s.id === slotId);
  if (!target) return slots;

  const removing = target.days.includes(day);
  const nextDays = removing
    ? target.days.filter((d) => d !== day)
    : [...target.days, day].sort((a, b) => a - b);

  return slots.map((slot) => {
    if (slot.id === slotId) {
      return { ...slot, days: nextDays.length ? nextDays : [day] };
    }
    if (!removing) {
      return { ...slot, days: slot.days.filter((d) => d !== day) };
    }
    return slot;
  });
}

function addSlot(slots: WeeklyHoursSlot[], settings: OpeningHoursSettings): WeeklyHoursSlot[] {
  const used = new Set(slots.flatMap((s) => s.days));
  const freeDay = [1, 2, 3, 4, 5, 6, 7].find((d) => !used.has(d)) ?? 7;
  const isSunday = freeDay === 7;
  return [
    ...slots,
    {
      id: `slot-${Date.now()}`,
      days: [freeDay],
      openTime: isSunday ? settings.defaultSunOpenTime : settings.defaultOpenTime,
      closeTime: isSunday ? settings.defaultSunCloseTime : settings.defaultCloseTime,
    },
  ];
}

export function OpeningHoursPresetBuilder({ preset, settings, shell, canDelete, onChange, onDelete }: Props) {
  const inputStyle = [
    styles.input,
    { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle },
  ];
  const slots = ensureSlots(preset, settings);

  function setSlots(next: WeeklyHoursSlot[]) {
    onChange({ slots: next });
  }

  return (
    <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
      <View style={styles.row}>
        <Text style={[styles.cardTitle, { color: shell.pageTitle }]} numberOfLines={1}>
          {preset.label || 'Raccourci'}
        </Text>
        <View style={styles.rowActions}>
          <Pressable
            onPress={() => onChange({ enabled: !preset.enabled })}
            style={[styles.badge, { backgroundColor: preset.enabled ? '#10b98133' : shell.filterInactiveBorder }]}
          >
            <Text style={{ color: preset.enabled ? '#10b981' : shell.pageKicker, fontSize: 10, fontWeight: '700' }}>
              {preset.enabled ? 'Actif' : 'Inactif'}
            </Text>
          </Pressable>
          {canDelete ? (
            <Pressable onPress={onDelete} hitSlop={8}>
              <Text style={styles.delete}>Supprimer</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={[styles.label, { color: shell.pageKicker }]}>Libellé du bouton (formulaire spot)</Text>
      <TextInput
        style={inputStyle}
        value={preset.label}
        onChangeText={(label) => onChange({ label })}
        placeholder="Ex. Lun–Ven + Dim"
        placeholderTextColor={shell.pageKicker}
      />

      <Text style={[styles.help, { color: shell.pageKicker }]}>
        Créez une plage par groupe de jours. Ex. Lun–Ven à 12h–23h et Dim à 12h–20h si les horaires diffèrent.
      </Text>

      {slots.map((slot, index) => (
        <View
          key={slot.id}
          style={[styles.slotCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.pageBg ?? 'transparent' }]}
        >
          <View style={styles.slotHeader}>
            <Text style={[styles.slotTitle, { color: shell.pageTitle }]}>
              Plage {index + 1}
              {slot.days.length ? ` · ${formatDaysCompact(slot.days)}` : ''}
            </Text>
            {slots.length > 1 ? (
              <Pressable
                onPress={() => setSlots(slots.filter((s) => s.id !== slot.id))}
                hitSlop={8}
              >
                <Text style={styles.delete}>Retirer</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={[styles.label, { color: shell.pageKicker }]}>Jours</Text>
          <View style={styles.dayRow}>
            {DAY_LABELS_SHORT.map((label, dayIndex) => {
              const day = dayIndex + 1;
              const selected = slot.days.includes(day);
              const usedElsewhere = slots.some((s) => s.id !== slot.id && s.days.includes(day));
              return (
                <Pressable
                  key={`${slot.id}-${label}`}
                  style={[
                    styles.dayChip,
                    {
                      borderColor: selected ? '#3b82f6' : shell.filterInactiveBorder,
                      backgroundColor: selected ? '#3b82f6' : shell.filterInactiveBg,
                      opacity: usedElsewhere && !selected ? 0.45 : 1,
                    },
                  ]}
                  onPress={() => setSlots(toggleDayInSlot(slots, slot.id, day))}
                >
                  <Text style={{ color: selected ? '#fff' : shell.pageTitle, fontSize: 11, fontWeight: '700' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Ouverture</Text>
              <TextInput
                style={inputStyle}
                value={slot.openTime}
                onChangeText={(openTime) => setSlots(updateSlot(slots, slot.id, { openTime }))}
                placeholder={settings.defaultOpenTime}
                placeholderTextColor={shell.pageKicker}
              />
            </View>
            <View style={styles.timeCol}>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Fermeture</Text>
              <TextInput
                style={inputStyle}
                value={slot.closeTime}
                onChangeText={(closeTime) => setSlots(updateSlot(slots, slot.id, { closeTime }))}
                placeholder={settings.defaultCloseTime}
                placeholderTextColor={shell.pageKicker}
              />
            </View>
          </View>
        </View>
      ))}

      <Pressable
        style={[styles.addSlotBtn, { borderColor: shell.filterInactiveBorder }]}
        onPress={() => setSlots(addSlot(slots, settings))}
      >
        <Text style={{ color: '#3b82f6', fontWeight: '700' }}>+ Ajouter une plage horaire</Text>
      </Pressable>

      <Text style={[styles.preview, { color: shell.pageKicker }]}>
        Aperçu affiché : {formatWeeklySchedules(slots)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700', fontSize: 14, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  delete: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  help: { fontSize: 11, lineHeight: 16, marginBottom: 8 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 4, fontSize: 14 },
  slotCard: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  slotTitle: { fontWeight: '700', fontSize: 13, flex: 1 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  dayChip: { minWidth: 40, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, borderWidth: 2, alignItems: 'center' },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeCol: { flex: 1 },
  addSlotBtn: { borderWidth: 1, borderRadius: 10, borderStyle: 'dashed', paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  preview: { fontSize: 11, fontStyle: 'italic', marginTop: 4, lineHeight: 16 },
});
