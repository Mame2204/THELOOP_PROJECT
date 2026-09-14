import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getAppSettings,
  setShowCommunitySuggestion as persistShowCommunitySuggestion,
  type AppSettings,
} from '@/lib/app-settings-store';

interface AppSettingsContextValue {
  settings: AppSettings;
  refreshSettings: () => Promise<void>;
  setShowCommunitySuggestion: (enabled: boolean) => Promise<{ synced: boolean; error?: string }>;
}

const DEFAULT_VALUE: AppSettingsContextValue = {
  settings: { showCommunitySuggestion: true },
  refreshSettings: async () => {},
  setShowCommunitySuggestion: async () => ({ synced: true }),
};

const AppSettingsContext = createContext<AppSettingsContextValue>(DEFAULT_VALUE);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({ showCommunitySuggestion: true });

  const refreshSettings = useCallback(async () => {
    setSettings(await getAppSettings());
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const updateShowCommunitySuggestion = useCallback(async (enabled: boolean) => {
    // Optimistic UI — le bouton disparaît immédiatement.
    setSettings({ showCommunitySuggestion: enabled });
    const result = await persistShowCommunitySuggestion(enabled);
    setSettings(result.settings);
    return { synced: result.synced, error: result.error };
  }, []);

  const value = useMemo(
    () => ({
      settings,
      refreshSettings,
      setShowCommunitySuggestion: updateShowCommunitySuggestion,
    }),
    [settings, refreshSettings, updateShowCommunitySuggestion],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  return useContext(AppSettingsContext);
}
