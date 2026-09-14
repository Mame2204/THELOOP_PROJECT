import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildRotatingQrPayload,
  msUntilNextRotatingQr,
  ROTATING_QR_WINDOW_MS,
  secondsUntilNextRotatingQr,
} from '@/lib/rotating-qr-token';

interface RotatingQrState {
  payload: string;
  secondsLeft: number;
  isReady: boolean;
}

/**
 * QR membre rotatif — recalcul local à chaque fenêtre (ROTATING_QR_WINDOW_MS).
 * Aucun appel réseau : le secret reste le qr_code_token stocké en base.
 */
export function useRotatingQrPayload(userId: string, secret: string, active = true): RotatingQrState {
  const [payload, setPayload] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(ROTATING_QR_WINDOW_MS / 1000);
  const [isReady, setIsReady] = useState(false);
  const secretRef = useRef(secret);
  const userIdRef = useRef(userId);

  secretRef.current = secret;
  userIdRef.current = userId;

  const refreshPayload = useCallback(async () => {
    const uid = userIdRef.current;
    const sec = secretRef.current;
    if (!uid || !sec.trim()) {
      setPayload('');
      setIsReady(false);
      return;
    }
    const next = await buildRotatingQrPayload(uid, sec);
    setPayload(next);
    setSecondsLeft(secondsUntilNextRotatingQr());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!active || !userId || !secret.trim()) {
      setPayload('');
      setIsReady(false);
      return;
    }

    let cancelled = false;
    let rotateTimeout: ReturnType<typeof setTimeout> | undefined;
    let rotateInterval: ReturnType<typeof setInterval> | undefined;

    const scheduleRotation = () => {
      clearTimeout(rotateTimeout);
      rotateTimeout = setTimeout(() => {
        if (cancelled) return;
        void refreshPayload();
        rotateInterval = setInterval(() => {
          void refreshPayload();
        }, ROTATING_QR_WINDOW_MS);
      }, msUntilNextRotatingQr());
    };

    void refreshPayload().then(() => {
      if (!cancelled) scheduleRotation();
    });

    const countdownInterval = setInterval(() => {
      if (!cancelled) setSecondsLeft(secondsUntilNextRotatingQr());
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(rotateTimeout);
      clearInterval(rotateInterval);
      clearInterval(countdownInterval);
    };
  }, [active, userId, secret, refreshPayload]);

  return { payload, secondsLeft, isReady };
}
