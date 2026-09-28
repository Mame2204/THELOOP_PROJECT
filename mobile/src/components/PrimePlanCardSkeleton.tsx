import { StyleSheet, View } from 'react-native';

interface PrimePlanCardSkeletonProps {
  borderColor: string;
  backgroundColor: string;
  pulseColor: string;
}

export function PrimePlanCardSkeleton({
  borderColor,
  backgroundColor,
  pulseColor,
}: PrimePlanCardSkeletonProps) {
  return (
    <View style={[styles.card, { borderColor, backgroundColor }]}>
      <View style={[styles.lineLg, { backgroundColor: pulseColor }]} />
      <View style={[styles.lineSm, { backgroundColor: pulseColor }]} />
      <View style={[styles.lineMd, { backgroundColor: pulseColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10 },
  lineLg: { height: 18, width: '55%', borderRadius: 6, opacity: 0.35 },
  lineSm: { height: 12, width: '85%', borderRadius: 6, opacity: 0.25 },
  lineMd: { height: 14, width: '40%', borderRadius: 6, opacity: 0.3 },
});
