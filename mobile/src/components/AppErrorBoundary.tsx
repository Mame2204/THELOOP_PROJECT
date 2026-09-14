import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Affiche une erreur JS en production (TestFlight) au lieu d'un écran blanc silencieux.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary]', error.message, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>THE LOOP — erreur au démarrage</Text>
        <Text style={styles.subtitle}>
          L'application a rencontré un problème. Copiez ce message pour le support.
        </Text>
        <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
          <Text style={styles.message} selectable>
            {error.name}: {error.message}
          </Text>
        </ScrollView>
        <Pressable style={styles.btn} onPress={this.reset}>
          <Text style={styles.btnLabel}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4FCFD',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0D7A8C',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 20,
    lineHeight: 20,
  },
  box: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  boxContent: {
    padding: 16,
  },
  message: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 18,
  },
  btn: {
    marginTop: 20,
    backgroundColor: '#12A8BC',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
