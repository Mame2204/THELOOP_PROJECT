import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  DEFAULT_APP_GATES,
  getAppGates,
  resolveActiveSystemGate,
  setMaintenanceGate as persistMaintenanceGate,
  setPassPurchaseEnabled as persistPassPurchaseEnabled,
  setPrelaunchGate as persistPrelaunchGate,
  setSignupEnabled as persistSignupEnabled,
  type ActiveSystemGate,
  type AppGates,
  type MaintenanceGateConfig,
  type PrelaunchGateConfig,
} from '@/lib/app-gates-store';

interface AppGatesContextValue {
  gates: AppGates;
  isReady: boolean;
  activeGate: ActiveSystemGate;
  sessionBypass: boolean;
  unlockSessionBypass: () => void;
  refreshGates: (force?: boolean) => Promise<void>;
  setSignupEnabled: (enabled: boolean) => Promise<{ synced: boolean; error?: string }>;
  setPassPurchaseEnabled: (enabled: boolean) => Promise<{ synced: boolean; error?: string }>;
  setPrelaunchGate: (patch: Partial<PrelaunchGateConfig>) => Promise<{ synced: boolean; error?: string }>;
  setMaintenanceGate: (patch: Partial<MaintenanceGateConfig>) => Promise<{ synced: boolean; error?: string }>;
}

const AppGatesContext = createContext<AppGatesContextValue | null>(null);

export function AppGatesProvider({ children }: { children: ReactNode }) {
  const [gates, setGates] = useState<AppGates>(DEFAULT_APP_GATES);
  const [isReady, setIsReady] = useState(false);
  const [sessionBypass, setSessionBypass] = useState(false);

  const refreshGates = useCallback(async (force = false) => {
    const next = await getAppGates({ force });
    setGates(next);
    setIsReady(true);
  }, []);

  useEffect(() => {
    void refreshGates(true);
  }, [refreshGates]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshGates(true);
    });
    return () => sub.remove();
  }, [refreshGates]);

  const unlockSessionBypass = useCallback(() => {
    setSessionBypass(true);
  }, []);

  const setSignupEnabled = useCallback(async (enabled: boolean) => {
    setGates((prev) => ({ ...prev, signupEnabled: enabled }));
    const result = await persistSignupEnabled(enabled);
    setGates(result.gates);
    return { synced: result.synced, error: result.error };
  }, []);

  const setPassPurchaseEnabled = useCallback(async (enabled: boolean) => {
    setGates((prev) => ({ ...prev, passPurchaseEnabled: enabled }));
    const result = await persistPassPurchaseEnabled(enabled);
    setGates(result.gates);
    return { synced: result.synced, error: result.error };
  }, []);

  const setPrelaunchGate = useCallback(async (patch: Partial<PrelaunchGateConfig>) => {
    setGates((prev) => ({
      ...prev,
      prelaunch: { ...prev.prelaunch, ...patch },
    }));
    const result = await persistPrelaunchGate(patch);
    setGates(result.gates);
    return { synced: result.synced, error: result.error };
  }, []);

  const setMaintenanceGate = useCallback(async (patch: Partial<MaintenanceGateConfig>) => {
    setGates((prev) => ({
      ...prev,
      maintenance: { ...prev.maintenance, ...patch },
    }));
    const result = await persistMaintenanceGate(patch);
    setGates(result.gates);
    return { synced: result.synced, error: result.error };
  }, []);

  const activeGate = useMemo(() => resolveActiveSystemGate(gates), [gates]);

  const value = useMemo<AppGatesContextValue>(
    () => ({
      gates,
      isReady,
      activeGate,
      sessionBypass,
      unlockSessionBypass,
      refreshGates,
      setSignupEnabled,
      setPassPurchaseEnabled,
      setPrelaunchGate,
      setMaintenanceGate,
    }),
    [
      gates,
      isReady,
      activeGate,
      sessionBypass,
      unlockSessionBypass,
      refreshGates,
      setSignupEnabled,
      setPassPurchaseEnabled,
      setPrelaunchGate,
      setMaintenanceGate,
    ],
  );

  return <AppGatesContext.Provider value={value}>{children}</AppGatesContext.Provider>;
}

export function useAppGates(): AppGatesContextValue {
  const ctx = useContext(AppGatesContext);
  if (!ctx) {
    return {
      gates: DEFAULT_APP_GATES,
      isReady: true,
      activeGate: null,
      sessionBypass: false,
      unlockSessionBypass: () => {},
      refreshGates: async () => {},
      setSignupEnabled: async () => ({ synced: true }),
      setPassPurchaseEnabled: async () => ({ synced: true }),
      setPrelaunchGate: async () => ({ synced: true }),
      setMaintenanceGate: async () => ({ synced: true }),
    };
  }
  return ctx;
}
