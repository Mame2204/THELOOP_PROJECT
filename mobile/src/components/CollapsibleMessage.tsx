import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface CollapsibleMessageProps {
  message: string;
  color: string;
  accentColor: string;
  compact?: boolean;
}

function normalizeMessage(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function firstLineOf(text: string): string {
  const line = text.split('\n')[0]?.trim() ?? '';
  return line || text.trim();
}

export function CollapsibleMessage({ message, color, accentColor, compact = false }: CollapsibleMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const normalized = normalizeMessage(message);
  const firstLine = firstLineOf(normalized);
  const hasFollowingLines = normalized.includes('\n') && normalized.trimEnd().length > firstLine.length;

  const canExpand = hasFollowingLines || truncated;
  const collapsedText = hasFollowingLines ? firstLine : normalized;

  function toggleExpanded() {
    if (canExpand) setExpanded((v) => !v);
  }

  return (
    <Pressable
      onPress={toggleExpanded}
      disabled={!canExpand}
      accessibilityRole={canExpand ? 'button' : 'text'}
      accessibilityHint={canExpand ? 'Appuyez pour afficher ou masquer le message complet' : undefined}
      style={[styles.wrap, compact && styles.wrapCompact]}
    >
      <Text
        style={[styles.body, compact && styles.bodyCompact, { color }]}
        numberOfLines={expanded ? undefined : 1}
        ellipsizeMode="tail"
        onTextLayout={(event) => {
          if (expanded) return;
          const lines = event.nativeEvent.lines;
          setTruncated(lines.length > 1);
        }}
      >
        {expanded ? normalized : collapsedText}
      </Text>
      {canExpand ? (
        <Text style={[styles.toggle, compact && styles.toggleCompact, { color: accentColor }]}>
          {expanded ? 'Réduire ↑' : 'Lire la suite ↓'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  wrapCompact: { marginTop: 4 },
  body: { fontSize: 14, lineHeight: 20 },
  bodyCompact: { fontSize: 13, lineHeight: 17 },
  toggle: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  toggleCompact: { marginTop: 3, fontSize: 11 },
});
