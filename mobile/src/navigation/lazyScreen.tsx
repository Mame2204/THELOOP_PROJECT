import { Component, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type ScreenFactory<P extends object> = () => ComponentType<P>;

class ScreenLoadErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Écran indisponible</Text>
          <Text style={styles.errorMsg} selectable>
            {this.state.error.message}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => this.setState({ error: null }, this.props.onRetry)}>
            <Text style={styles.retryLabel}>Réessayer</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Charge un écran à la demande (require différé) — évite d'évaluer 50+ modules au boot TestFlight.
 */
export function lazyScreen<P extends object>(factory: ScreenFactory<P>, label?: string): ComponentType<P> {
  let cached: ComponentType<P> | null = null;
  let loadError: Error | null = null;
  let loadKey = 0;

  function LazyScreen(props: P) {
    if (!cached && !loadError) {
      try {
        cached = factory();
      } catch (err) {
        loadError = err instanceof Error ? err : new Error(String(err));
        console.error(`[lazyScreen${label ? `:${label}` : ''}]`, loadError);
      }
    }

    if (loadError) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Écran indisponible{label ? ` (${label})` : ''}</Text>
          <Text style={styles.errorMsg} selectable>
            {loadError.message}
          </Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              loadError = null;
              cached = null;
              loadKey += 1;
            }}
          >
            <Text style={styles.retryLabel}>Réessayer</Text>
          </Pressable>
        </View>
      );
    }

    if (!cached) {
      return (
        <View style={styles.loadingRoot}>
          <ActivityIndicator size="large" color="#12A8BC" />
        </View>
      );
    }

    const Screen = cached;
    return (
      <ScreenLoadErrorBoundary
        key={loadKey}
        onRetry={() => {
          loadKey += 1;
        }}
      >
        <Screen {...props} />
      </ScreenLoadErrorBoundary>
    );
  }

  LazyScreen.displayName = label ? `Lazy(${label})` : 'LazyScreen';
  return LazyScreen as ComponentType<P>;
}

/** Helper pour Stack.Screen getComponent — require statique obligatoire pour Metro. */
export function requireScreen<T extends ComponentType<object>>(
  loader: () => T,
  label?: string,
): () => T {
  return () => {
    try {
      return loader();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[requireScreen${label ? `:${label}` : ''}]`, error);
      throw error;
    }
  };
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4FCFD',
  },
  errorRoot: {
    flex: 1,
    backgroundColor: '#F4FCFD',
    padding: 24,
    paddingTop: 64,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#B91C1C',
    marginBottom: 12,
  },
  errorMsg: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 20,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#12A8BC',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryLabel: {
    color: '#fff',
    fontWeight: '700',
  },
});
