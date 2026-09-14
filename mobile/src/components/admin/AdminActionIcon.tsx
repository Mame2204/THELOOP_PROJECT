import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type AdminActionIconName =
  | 'edit'
  | 'preview'
  | 'publish'
  | 'run'
  | 'archive'
  | 'delete'
  | 'deactivate'
  | 'draft'
  | 'approve'
  | 'reject';

const LABEL_MAP: Record<AdminActionIconName, string> = {
  edit: 'Éditer',
  preview: 'Aperçu',
  publish: 'Publier',
  run: 'Exécuter',
  archive: 'Archiver',
  delete: 'Supprimer',
  deactivate: 'Désactiver',
  draft: 'Brouillon',
  approve: 'Valider',
  reject: 'Refuser',
};

const COLOR_MAP: Record<AdminActionIconName, string> = {
  edit: '#3b82f6',
  preview: '#8E1631',
  publish: '#10b981',
  run: '#f59e0b',
  archive: '#94a3b8',
  delete: '#ef4444',
  deactivate: '#f59e0b',
  draft: '#64748b',
  approve: '#10b981',
  reject: '#ef4444',
};

function ActionGlyph({ action, size, color }: { action: AdminActionIconName; size: number; color: string }) {
  const stroke = color;
  const sw = 2;
  const common = { fill: 'none' as const, stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (action) {
    case 'edit':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...common} d="M12 20h9" />
          <Path {...common} d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </Svg>
      );
    case 'preview':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...common} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <Circle {...common} cx="12" cy="12" r="3" />
        </Svg>
      );
    case 'publish':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle {...common} cx="12" cy="12" r="10" />
          <Path {...common} d="M9 12l2 2 4-4" />
        </Svg>
      );
    case 'run':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M8 5v14l11-7z" fill={stroke} />
        </Svg>
      );
    case 'archive':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polyline {...common} points="21 8 21 21 3 21 3 8" />
          <Rect {...common} x="1" y="3" width="22" height="5" />
          <Line {...common} x1="10" y1="12" x2="14" y2="12" />
        </Svg>
      );
    case 'delete':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polyline {...common} points="3 6 5 6 21 6" />
          <Path {...common} d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <Path {...common} d="M10 11v6M14 11v6" />
          <Path {...common} d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </Svg>
      );
    case 'deactivate':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle {...common} cx="12" cy="12" r="10" />
          <Line {...common} x1="10" y1="15" x2="10" y2="9" />
          <Line {...common} x1="14" y1="15" x2="14" y2="9" />
        </Svg>
      );
    case 'draft':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path {...common} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline {...common} points="14 2 14 8 20 8" />
          <Line {...common} x1="8" y1="13" x2="16" y2="13" />
          <Line {...common} x1="8" y1="17" x2="13" y2="17" />
        </Svg>
      );
    case 'approve':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polyline {...common} points="20 6 9 17 4 12" />
        </Svg>
      );
    case 'reject':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Line {...common} x1="18" y1="6" x2="6" y2="18" />
          <Line {...common} x1="6" y1="6" x2="18" y2="18" />
        </Svg>
      );
  }
}

interface Props {
  action: AdminActionIconName;
  onPress: () => void;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function AdminActionIcon({ action, onPress, color, size = 22, style, disabled }: Props) {
  const tint = color ?? COLOR_MAP[action];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={LABEL_MAP[action]}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { opacity: disabled ? 0.35 : pressed ? 0.55 : 1 },
        style,
      ]}
      hitSlop={6}
    >
      <ActionGlyph action={action} size={size} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 10,
    borderRadius: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
