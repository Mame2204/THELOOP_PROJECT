import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { subscribePaymentReturn } from '@/lib/payment-return-events';
import { recoverPassAfterPaymentReturn } from '@/lib/payment-return-recovery';
import { isAuthenticated } from '@/types';

const RECOVERY_DEBOUNCE_MS = 800;

/**
 * Sync Mon PASS après retour Djomy même si PassPaymentScreen a été démonté (Android).
 */
export function PaymentReturnHandler() {
  const { user, role, refreshUserSession } = useAuthContext();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedRef = useRef(false);

  const runRecovery = useCallback(
    async (showAlert: boolean) => {
      if (!user?.id || !isAuthenticated(role) || user.id === 'anonymous') return;

      const outcome = await recoverPassAfterPaymentReturn(user.id, user.firstName);
      if (outcome.kind === 'synced') {
        await refreshUserSession();
        if (showAlert && !notifiedRef.current) {
          notifiedRef.current = true;
          const message = outcome.activated
            ? 'Votre PASS est actif. Consultez Mon PASS pour le détail.'
            : outcome.queued
              ? 'Votre PASS est en file d\'attente. Consultez Mon PASS.'
              : 'Votre achat a été synchronisé. Consultez Mon PASS.';
          Alert.alert('Paiement synchronisé', message);
        }
      }
    },
    [user?.id, user?.firstName, role, refreshUserSession],
  );

  const scheduleRecovery = useCallback(
    (showAlert: boolean) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runRecovery(showAlert);
      }, RECOVERY_DEBOUNCE_MS);
    },
    [runRecovery],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    notifiedRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    return subscribePaymentReturn(() => {
      scheduleRecovery(true);
    });
  }, [scheduleRecovery]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleRecovery(false);
    });
    return () => sub.remove();
  }, [scheduleRecovery]);

  useEffect(() => {
    if (user?.id && isAuthenticated(role)) {
      scheduleRecovery(false);
    }
  }, [user?.id, role, scheduleRecovery]);

  return null;
}
