import { StyleSheet, Text, View } from 'react-native';
import type { HomeLocation } from '@/lib/demo-data';
import {
  formatDaysCompact,
  formatOpeningHoursForDisplay,
  parseOpeningHoursText,
  type WeeklyHoursSlot,
} from '@/lib/opening-hours';
import { useMemberTheme } from '@/hooks/useMemberTheme';

interface LocationMetaStripProps {
  location: HomeLocation;
}

/** Bloc 2 spot : horaires uniquement (lieu / tarif / résa = hero ou Contacter). */
export function LocationMetaStrip({ location }: LocationMetaStripProps) {
  const { shell, theme } = useMemberTheme();
  const c = theme.colors;
  const raw = location.openingHours?.trim() || '';
  const display = formatOpeningHoursForDisplay(raw || 'Non renseignés');
  const parsed = parseOpeningHoursText(raw);
  const slots: WeeklyHoursSlot[] =
    parsed.mode === 'weekly' ? parsed.slots : [];

  const isSpecial =
    parsed.mode === 'always_open' ||
    parsed.mode === 'by_appointment' ||
    !raw ||
    /non renseign/i.test(display);

  return (
    <View
      style={[
        styles.wrap,
        theme.elevation.card,
        {
          backgroundColor: c.surfaceElevated,
          borderColor: c.border,
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <Text style={[styles.kicker, { color: shell.pageKicker }]}>Horaires</Text>

      {isSpecial || slots.length === 0 ? (
        <View style={[styles.specialPill, { backgroundColor: c.accentSoft, borderColor: c.accentBorder }]}>
          <Text style={[styles.specialText, { color: c.textPrimary }]}>{display}</Text>
        </View>
      ) : (
        <View style={styles.slots}>
          {slots.map((slot) => {
            const days = slot.days.length === 7 ? 'Tous les jours' : formatDaysCompact(slot.days);
            return (
              <View
                key={slot.id}
                style={[styles.slotRow, { backgroundColor: c.accentSoft, borderColor: c.accentBorder }]}
              >
                <Text style={[styles.slotDays, { color: c.textSecondary }]} numberOfLines={1}>
                  {days}
                </Text>
                <Text style={[styles.slotTime, { color: c.accentDeep }]}>
                  {slot.openTime} – {slot.closeTime}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  specialPill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  specialText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  slots: { gap: 6 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  slotDays: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 0,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
