import { useEffect } from 'react';
import { Appearance, Linking, Platform, View } from 'react-native';
import { emitPaymentReturn, isPaymentReturnUrl } from '@/lib/payment-return-events';
import { CategoryLabelsProvider } from '@/context/CategoryLabelsContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { AdminPermissionsProvider } from '@/context/AdminPermissionsContext';
import { AdminCountryProvider } from '@/context/AdminCountryContext';
import { ContentCountriesProvider } from '@/context/ContentCountriesContext';
import { ViewingCountryProvider } from '@/context/ViewingCountryContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { ContentProvider } from '@/context/ContentContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { RatingsProvider } from '@/context/RatingsContext';
import { FavoritesSignupProvider } from '@/context/FavoritesSignupContext';
import { AppLocaleProvider } from '@/context/AppLocaleContext';
import { AppSettingsProvider } from '@/context/AppSettingsContext';
import { AppGatesProvider } from '@/context/AppGatesContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AppKeyboardRoot } from '@/components/KeyboardAwareFormScroll';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppBootGate } from '@/components/AppBootGate';

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'ios') {
      Appearance.setColorScheme('light');
    }
  }, []);

  useEffect(() => {
    const handlePaymentReturn = (url: string | null) => {
      if (!isPaymentReturnUrl(url)) return;
      emitPaymentReturn();
    };
    void Linking.getInitialURL().then(handlePaymentReturn);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handlePaymentReturn(url);
    });
    return () => subscription.remove();
  }, []);

  return (
    <AppErrorBoundary>
    <View style={{ flex: 1, backgroundColor: '#F4FCFD' }}>
      <SafeAreaProvider>
        <AppKeyboardRoot>
          <AuthProvider>
            <AdminPermissionsProvider>
              <ThemeProvider>
                <ContentCountriesProvider>
                  <AdminCountryProvider>
                    <CategoryLabelsProvider>
                      <ViewingCountryProvider>
                        <NotificationsProvider>
                          <ContentProvider>
                            <FavoritesProvider>
                              <RatingsProvider>
                                <AppLocaleProvider>
                                  <AppSettingsProvider>
                                    <AppGatesProvider>
                                      <FavoritesSignupProvider>
                                        <AppBootGate />
                                      </FavoritesSignupProvider>
                                    </AppGatesProvider>
                                  </AppSettingsProvider>
                                </AppLocaleProvider>
                              </RatingsProvider>
                            </FavoritesProvider>
                          </ContentProvider>
                        </NotificationsProvider>
                      </ViewingCountryProvider>
                    </CategoryLabelsProvider>
                  </AdminCountryProvider>
                </ContentCountriesProvider>
              </ThemeProvider>
            </AdminPermissionsProvider>
          </AuthProvider>
        </AppKeyboardRoot>
      </SafeAreaProvider>
    </View>
    </AppErrorBoundary>
  );
}
