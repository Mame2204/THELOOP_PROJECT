import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Charge au focus sans spam réseau.
 * - 1er focus / données absentes → charge
 * - focus suivants dans le TTL → no-op
 * - pull-to-refresh / mutations → appeler `run(true)`
 * - `resetKey` (pays, onglet…) → invalide le TTL pour recharger
 *
 * Préférable à un setInterval global (egress) et à un cooldown court arbitraire.
 */
export function useFocusLoad(
  loader: (force: boolean) => Promise<void>,
  options?: { ttlMs?: number; enabled?: boolean; resetKey?: string | number | boolean | null },
): { run: (force?: boolean) => Promise<void> } {
  const ttlMs = options?.ttlMs ?? 60_000;
  const enabled = options?.enabled !== false;
  const resetKey = options?.resetKey;
  const lastAtRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    lastAtRef.current = 0;
    loadedOnceRef.current = false;
  }, [resetKey]);

  const run = useCallback(
    async (force = false) => {
      if (!enabled) return;
      const now = Date.now();
      if (!force && loadedOnceRef.current && now - lastAtRef.current < ttlMs) {
        return;
      }
      if (inflightRef.current) {
        if (!force) return;
        await inflightRef.current;
      }
      const job = (async () => {
        await loader(force);
        lastAtRef.current = Date.now();
        loadedOnceRef.current = true;
      })();
      inflightRef.current = job;
      try {
        await job;
      } finally {
        if (inflightRef.current === job) inflightRef.current = null;
      }
    },
    [enabled, loader, ttlMs],
  );

  useFocusEffect(
    useCallback(() => {
      void run(false);
    }, [run]),
  );

  return { run };
}
