import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ContactChoiceSheet } from '@/components/ContactChoiceSheet';
import { VisitorGatewayPanel } from '@/components/VisitorGatewaySheet';
import { useFavoritesSignup, type AuthNavigation } from '@/context/FavoritesSignupContext';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VisitorGateway'>;

function authNavigationFrom(
  pending: AuthNavigation | null,
  fallback: Props['navigation'],
): AuthNavigation {
  if (pending?.navigate) return pending;
  return {
    navigate: (name, params) => {
      if (name === 'Auth') {
        fallback.navigate('Auth', params as RootStackParamList['Auth']);
        return;
      }
      if (name === 'Suggestion') {
        fallback.navigate('Suggestion');
        return;
      }
    },
  };
}

export function VisitorGatewayScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { takePendingAuthNavigation } = useFavoritesSignup();
  const authNavRef = useRef<AuthNavigation | null>(null);
  if (!authNavRef.current) {
    authNavRef.current = authNavigationFrom(takePendingAuthNavigation(), navigation);
  }
  const authNav = authNavRef.current;
  const [contactOpen, setContactOpen] = useState(false);

  function closeGateway() {
    setContactOpen(false);
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Pressable style={styles.backdrop} onPress={closeGateway} accessibilityLabel="Fermer" />
      <View style={styles.center} pointerEvents="box-none">
        <VisitorGatewayPanel
          onClose={closeGateway}
          onSignup={() => {
            closeGateway();
            authNav.navigate('Auth', { mode: 'signup' });
          }}
          onLogin={() => {
            closeGateway();
            authNav.navigate('Auth', { mode: 'login' });
          }}
          onOpenContact={() => setContactOpen(true)}
        />
      </View>
      <ContactChoiceSheet
        visible={contactOpen}
        onClose={() => setContactOpen(false)}
        onSuggestion={() => {
          setContactOpen(false);
          closeGateway();
          authNav.navigate('Suggestion');
        }}
        onWhatsAppDone={closeGateway}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
