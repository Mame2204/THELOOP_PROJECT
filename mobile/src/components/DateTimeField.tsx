import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface DateTimeFieldProps {
  value: string;
  onChange: (isoLocal: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  dateOnly?: boolean;
  flat?: boolean;
  shell: {
    filterInactiveBg: string;
    filterInactiveBorder: string;
    pageTitle: string;
    pageKicker: string;
  };
}

function parseValue(value: string): Date {
  if (!value.trim()) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDisplay(date: Date, dateOnly?: boolean): string {
  if (dateOnly) {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalInputValue(date: Date, dateOnly?: boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (dateOnly) return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DateTimeField({
  value,
  onChange,
  placeholder,
  minimumDate,
  maximumDate,
  dateOnly,
  flat,
  shell,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState<'date' | 'time' | null>(null);
  const [draft, setDraft] = useState(() => parseValue(value));
  const date = parseValue(value);
  const hasValue = Boolean(value.trim());

  useEffect(() => {
    if (open) setDraft(parseValue(value));
  }, [open, value]);

  function emit(next: Date) {
    onChange(toLocalInputValue(next, dateOnly));
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    // Android : boîte modale — une sélection = fermer / enchaîner
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed' || !selected) {
        setOpen(null);
        return;
      }

      if (dateOnly) {
        emit(selected);
        setOpen(null);
        return;
      }

      if (open === 'date') {
        const merged = new Date(selected);
        merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
        emit(merged);
        setOpen('time');
        return;
      }

      if (open === 'time') {
        const merged = new Date(date);
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        emit(merged);
        setOpen(null);
      }
      return;
    }

    // iOS spinner : ne pas fermer à chaque cran — seulement mettre à jour le brouillon
    if (selected) setDraft(selected);
  }

  function onIosConfirm() {
    if (dateOnly || open === 'date') {
      const merged = new Date(draft);
      if (!dateOnly) {
        merged.setHours(
          hasValue ? date.getHours() : draft.getHours(),
          hasValue ? date.getMinutes() : draft.getMinutes(),
          0,
          0,
        );
      }
      emit(merged);
      if (!dateOnly && open === 'date') {
        setOpen('time');
        return;
      }
      setOpen(null);
      return;
    }

    if (open === 'time') {
      const merged = new Date(hasValue ? date : draft);
      merged.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
      emit(merged);
      setOpen(null);
    }
  }

  return (
    <View>
      <Pressable
        style={[
          styles.field,
          { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder },
          flat && styles.fieldFlat,
        ]}
        onPress={() => setOpen('date')}
      >
        <Text style={[styles.fieldText, { color: hasValue ? shell.pageTitle : shell.pageKicker }]}>
          {hasValue
            ? formatDisplay(date, dateOnly)
            : (placeholder ?? (dateOnly ? 'Choisir une date' : 'Choisir date et heure'))}
        </Text>
        <Text style={[styles.fieldIcon, { color: shell.pageKicker }]}>{dateOnly ? '📅' : '🕒'}</Text>
      </Pressable>

      {!dateOnly ? (
        <Pressable style={styles.timeLink} onPress={() => setOpen('time')}>
          <Text style={[styles.timeLinkText, { color: shell.pageKicker }]}>
            {hasValue ? `Modifier l'heure (${formatDisplay(date).slice(-5)})` : 'Choisir l\'heure'}
          </Text>
        </Pressable>
      ) : null}

      {open === 'date' ? (
        <DateTimePicker
          value={Platform.OS === 'ios' ? draft : date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          locale="fr-FR"
          onChange={onPickerChange}
        />
      ) : null}

      {open === 'time' ? (
        <DateTimePicker
          value={Platform.OS === 'ios' ? draft : date}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          is24Hour
          locale="fr-FR"
          onChange={onPickerChange}
        />
      ) : null}

      {Platform.OS === 'ios' && open ? (
        <View style={styles.iosBar}>
          <Pressable style={styles.iosCancel} onPress={() => setOpen(null)}>
            <Text style={[styles.iosCancelText, { color: shell.pageKicker }]}>Annuler</Text>
          </Pressable>
          <Text style={[styles.iosStep, { color: shell.pageKicker }]}>
            {open === 'date' ? (dateOnly ? 'Date' : '1/2 · Date') : '2/2 · Heure'}
          </Text>
          <Pressable style={styles.iosDone} onPress={onIosConfirm}>
            <Text style={styles.iosDoneText}>{open === 'date' && !dateOnly ? 'Suivant' : 'OK'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldFlat: { borderWidth: 0 },
  fieldText: { fontSize: 14, flex: 1, paddingRight: 8 },
  fieldIcon: { fontSize: 16 },
  timeLink: { marginBottom: 10, alignSelf: 'flex-start' },
  timeLinkText: { fontSize: 12, fontWeight: '600' },
  iosBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  iosCancel: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 72 },
  iosCancelText: { fontSize: 14, fontWeight: '600' },
  iosStep: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  iosDone: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 72, alignItems: 'flex-end' },
  iosDoneText: { fontSize: 14, fontWeight: '700', color: '#10b981' },
});
