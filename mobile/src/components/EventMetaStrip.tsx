import { StyleSheet, Text, View } from 'react-native';
import type { Event } from '@/types';
import {
  formatEventDateTimeStart,
  formatEventPrice,
} from '@/lib/event-actions';
import { useMemberTheme } from '@/hooks/useMemberTheme';

interface EventMetaStripProps {
  event: Event;
  variant?: 'default' | 'inline';
  /** Conservé pour compat — le lieu est affiché dans le hero (bloc 1). */
  linkedSpotSlug?: string | null;
  onVenuePress?: () => void;
}

export function EventMetaStrip({
  event,
  variant = 'default',
}: EventMetaStripProps) {
  const { theme } = useMemberTheme();
  const c = theme.colors;

  const items = [
    { label: 'Date & heure', value: formatEventDateTimeStart(event) },
    { label: 'Tarif', value: formatEventPrice(event), highlight: true },
  ];

  const cellStyle = {
    backgroundColor: c.accentSoft,
    borderColor: c.accentBorder,
  };
  const labelStyle = { color: c.textSecondary };
  const valueStyle = { color: c.textPrimary };
  const highlightStyle = { color: c.accentDeep };

  if (variant === 'inline') {
    return (
      <View style={[styles.inlineRow, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
        {items.map((item) => (
          <View key={item.label} style={[styles.inlineCell, cellStyle]}>
            <Text
              style={[styles.inlineValue, valueStyle, item.highlight && highlightStyle]}
              numberOfLines={1}
            >
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.gridWrap,
        theme.elevation.card,
        {
          backgroundColor: c.surfaceElevated,
          borderColor: c.border,
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <View style={styles.grid}>
        {items.map((item) => (
          <View key={item.label} style={[styles.cell, cellStyle]}>
            <Text style={[styles.cellLabel, labelStyle]}>{item.label}</Text>
            <Text style={[styles.cellValue, valueStyle, item.highlight && highlightStyle]}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  inlineCell: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minWidth: 0,
  },
  inlineValue: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  gridWrap: { borderWidth: 1, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6, gap: 6 },
  cell: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cellLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cellValue: { marginTop: 2, fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
