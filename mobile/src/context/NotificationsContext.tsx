import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import {
  countUnreadNotifications,
  invalidateNotificationListCache,
  subscribeUserNotifications,
} from '@/lib/user-notifications-store';
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  registerForPushNotifications,
} from '@/lib/push-notifications';
import { isAuthenticated } from '@/types';

interface NotificationsContextValue {
  unreadCount: number;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Badge + sync push sans Realtime permanent (egress WebSocket + refetches en cascade). */
const UNREAD_SYNC_TTL_MS = 90_000;

/** Rafale de push reçus → un rechargement espacé, jamais un refetch forcé par push. */
const PUSH_REFRESH_MIN_INTERVAL_MS = 3_000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuthContext();
  const [unreadCount, setUnreadCount] = useState(0);
  const lastPushRegisterAtRef = useRef(0);
  const lastUnreadSyncAtRef = useRef(0);
  const lastPushRefreshAtRef = useRef(0);
  const pushRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = user?.id;

  const refresh = useCallback(
    async (force = false) => {
      if (!userId || !isAuthenticated(role) || userId === 'anonymous') {
        setUnreadCount(0);
        return;
      }
      const now = Date.now();
      if (!force && lastUnreadSyncAtRef.current > 0 && now - lastUnreadSyncAtRef.current < UNREAD_SYNC_TTL_MS) {
        return;
      }
      setUnreadCount(await countUnreadNotifications(userId, { force }));
      lastUnreadSyncAtRef.current = Date.now();
    },
    [userId, role],
  );

  const refreshFromPush = useCallback(() => {
    invalidateNotificationListCache();
    const elapsed = Date.now() - lastPushRefreshAtRef.current;
    if (elapsed >= PUSH_REFRESH_MIN_INTERVAL_MS) {
      lastPushRefreshAtRef.current = Date.now();
      void refresh(true);
      return;
    }
    if (pushRefreshTimerRef.current) return;
    pushRefreshTimerRef.current = setTimeout(() => {
      pushRefreshTimerRef.current = null;
      lastPushRefreshAtRef.current = Date.now();
      void refresh(true);
    }, PUSH_REFRESH_MIN_INTERVAL_MS - elapsed);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (pushRefreshTimerRef.current) clearTimeout(pushRefreshTimerRef.current);
    };
  }, []);

  const registerPush = useCallback(
    (force = false) => {
      if (!userId || !isAuthenticated(role) || userId === 'anonymous') return;
      const now = Date.now();
      // Évite le spam, mais permet un refresh au retour foreground (~1× / 2 min).
      if (!force && now - lastPushRegisterAtRef.current < 120_000) return;
      lastPushRegisterAtRef.current = now;
      void registerForPushNotifications(userId);
    },
    [userId, role],
  );

  useEffect(() => {
    lastUnreadSyncAtRef.current = 0;
    let cancelled = false;
    void (async () => {
      if (!userId || !isAuthenticated(role) || userId === 'anonymous') {
        if (!cancelled) setUnreadCount(0);
        return;
      }
      const count = await countUnreadNotifications(userId, { force: true });
      if (!cancelled) {
        setUnreadCount(count);
        lastUnreadSyncAtRef.current = Date.now();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  useEffect(() => {
    return subscribeUserNotifications(() => {
      // Mutations locales : badge depuis le cache mémoire déjà à jour (pas de re-download).
      void (async () => {
        if (!userId || !isAuthenticated(role) || userId === 'anonymous') {
          setUnreadCount(0);
          return;
        }
        setUnreadCount(await countUnreadNotifications(userId, { force: false }));
      })();
    });
  }, [userId, role]);

  // Token push : différé pour ne pas crasher le cold start Android (FCM / permissions).
  useEffect(() => {
    if (!userId || !isAuthenticated(role) || userId === 'anonymous') {
      lastPushRegisterAtRef.current = 0;
      return;
    }
    const timer = setTimeout(() => registerPush(true), 2500);
    return () => clearTimeout(timer);
  }, [userId, role, registerPush]);

  // Au retour sur l’app : badge (TTL) + token push (2 min).
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        registerPush(false);
        void refresh(false);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [registerPush, refresh]);

  useEffect(() => {
    let remove: (() => void) | undefined;
    let cancelled = false;
    void addNotificationResponseListener(() => {
      void refresh(true);
    }).then((sub) => {
      if (cancelled) {
        sub?.remove();
        return;
      }
      remove = sub?.remove;
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [refresh]);

  useEffect(() => {
    let remove: (() => void) | undefined;
    let cancelled = false;
    void addNotificationReceivedListener(() => {
      // Inbox déjà persistée côté serveur (RPC notify_* / campagnes).
      // Ne pas ré-insérer ici : doublons + boucle emit → refresh → push local → reçu → …
      invalidateNotificationListCache();
      refreshFromPush();
    }).then((sub) => {
      if (cancelled) {
        sub?.remove();
        return;
      }
      remove = sub?.remove;
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [refreshFromPush, userId, role]);

  const value = useMemo(
    () => ({
      unreadCount,
      refresh: () => refresh(true),
    }),
    [unreadCount, refresh],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications requires NotificationsProvider');
  return ctx;
}
