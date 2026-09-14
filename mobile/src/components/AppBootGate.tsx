import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { LoopLogo } from '@/components/LoopLogo';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* simulateur / build sans module natif */
});

/**
 * Charge RootNavigator à la demande.
 * Même expérience iOS / Android : splash natif → écran logo THE LOOP + spinner.
 */
export function AppBootGate() {
  const [Navigator, setNavigator] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [splashHidden, setSplashHidden] = useState(false);
  const [bootReady, setBootReady] = useState(false);

  function hideNativeSplash() {
    if (splashHidden) return;
    setSplashHidden(true);
    void SplashScreen.hideAsync();
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setNavigator(null);
    setBootReady(false);

    void import('@/navigation/RootNavigator')
      .then(async (mod) => {
        if (cancelled) return;
        // Même délai iOS/Android pour le même écran de chargement (logo + spinner).
        await new Promise((r) => setTimeout(r, 200));
        if (cancelled) return;
        setNavigator(() => mod.RootNavigator);
        setBootReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[AppBootGate]', message);
        setError(message);
        setBootReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (bootReady) hideNativeSplash();
  }, [bootReady]);

  if (error) {
    return (
      <View style={styles.root} onLayout={hideNativeSplash} collapsable={false}>
        <LoopLogo variant="app" size="lg" stacked />
        <Text style={styles.title}>THE LOOP — chargement interrompu</Text>
        <Text style={styles.msg} selectable>
          {error}
        </Text>
        <Pressable style={styles.btn} onPress={() => setAttempt((n) => n + 1)}>
          <Text style={styles.btnLabel}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  if (!Navigator || !bootReady) {
    return (
      <View style={styles.root} onLayout={hideNativeSplash} collapsable={false}>
        <LoopLogo variant="app" size="xl" stacked />
        <ActivityIndicator size="large" color="#12A8BC" style={styles.spinner} />
        <Text style={styles.loading}>Chargement de THE LOOP…</Text>
      </View>
    );
  }

  return <Navigator />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4FCFD',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  spinner: {
    marginTop: 28,
  },
  loading: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#0D7A8C',
  },
  title: {
    marginTop: 24,
    fontSize: 18,
    fontWeight: '800',
    color: '#B91C1C',
    marginBottom: 12,
    textAlign: 'center',
  },
  msg: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  btn: {
    backgroundColor: '#12A8BC',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnLabel: {
    color: '#fff',
    fontWeight: '700',
  },
});
