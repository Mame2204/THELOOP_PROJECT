import '@/lib/supabase-crypto-polyfill';
import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { registerRootComponent } from 'expo';
import App from './App';

/**
 * Android : désactive les ScreenStack natifs.
 * Contourne IndexOutOfBoundsException getChildDrawingOrder (RefreshControl + screens).
 * iOS conserve l’optimisation native.
 */
if (Platform.OS === 'android') {
  enableScreens(false);
}

registerRootComponent(App);
