import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoopLogo } from '@/components/LoopLogo';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import type { ActiveSystemGate, AppGates } from '@/lib/app-gates-store';

interface Props {
  kind: Exclude<ActiveSystemGate, null>;
  gates: AppGates;
  onSecretUnlock: () => void;
}

const TAP_WINDOW_MS = 2000;
const TAP_TARGET = 4;

function formatCountdown(targetIso: string | null, nowMs: number): string {
  if (!targetIso) return '—';
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return '—';
  const diff = Math.max(0, target - nowMs);
  if (diff <= 0) return '00:00:00:00';
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function SystemGateScreen({ kind, gates, onSecretUnlock }: Props) {
  const insets = useSafeAreaInsets();
  const { shell } = useMemberTheme();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tapsRef = useRef<number[]>([]);

  const config = kind === 'maintenance' ? gates.maintenance : gates.prelaunch;
  const showCountdown =
    kind === 'prelaunch' && gates.prelaunch.mode === 'countdown' && Boolean(gates.prelaunch.countdownTo);

  useEffect(() => {
    if (!showCountdown) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showCountdown]);

  const countdownLabel = useMemo(
    () => (showCountdown ? formatCountdown(gates.prelaunch.countdownTo, nowMs) : null),
    [showCountdown, gates.prelaunch.countdownTo, nowMs],
  );

  function handleSecretTap() {
    const now = Date.now();
    const recent = tapsRef.current.filter((t) => now - t < TAP_WINDOW_MS);
    recent.push(now);
    tapsRef.current = recent;
    if (recent.length >= TAP_TARGET) {
      tapsRef.current = [];
      onSecretUnlock();
    }
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: shell.pageBg,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <LoopLogo variant="app" size="lg" stacked />
      <Pressable onPress={handleSecretTap} accessibilityRole="button" style={styles.secretHit}>
        <Text style={[styles.title, { color: shell.pageTitle }]}>{config.title}</Text>
        {countdownLabel ? (
          <Text style={[styles.countdown, { color: shell.tabIndicator }]}>{countdownLabel}</Text>
        ) : null}
        <Text style={[styles.message, { color: shell.pageKicker }]}>{config.message}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  secretHit: {
    marginTop: 36,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
    textAlign: 'center',
  },
  countdown: {
    marginTop: 28,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  message: {
    marginTop: 20,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 340,
  },
});
