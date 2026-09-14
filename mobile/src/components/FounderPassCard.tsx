import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Brightness from 'expo-brightness';
import QRCode from 'react-native-qrcode-svg';
import { useRotatingQrPayload } from '@/hooks/useRotatingQrPayload';
import { formatRotatingQrWindowLabel, shortUserId } from '@/lib/rotating-qr-token';
import { BRAND, LOOP_GOLD } from '@/lib/theme-config';
import type { User } from '@/types';

const SCAN_BRIGHTNESS = 1;
/** QR légèrement agrandi, collé au badge Fondateur. */
const QR_SIZE_COMPACT = 80;
const QR_SIZE_FULL = 280;
const BORDEAUX = BRAND.ADMIN.accentDeep;
const BORDEAUX_TEXT = BRAND.ADMIN.accent;
const CARD_BG = '#F4E8EB';

interface FounderPassCardProps {
  user: User;
  rotationActive?: boolean;
}

/** Passe fondateur — QR à droite, juste sous le badge Fondateur. */
export function FounderPassCard({ user, rotationActive = true }: FounderPassCardProps) {
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.fullName || 'Fondateur';
  const secret = user.qrCodeToken?.trim() || `LOOP-${shortUserId(user.id)}`;

  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [expanded, setExpanded] = useState(false);
  const previousBrightness = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const qrWindowLabel = formatRotatingQrWindowLabel();
  const { payload, secondsLeft, isReady } = useRotatingQrPayload(
    user.id,
    secret,
    (rotationActive && appActive) || expanded,
  );
  const qrValue = isReady ? payload : '';

  const restoreBrightness = useCallback(async () => {
    if (previousBrightness.current == null) return;
    try {
      await Brightness.setBrightnessAsync(previousBrightness.current);
    } catch {
      /* ignore */
    }
    previousBrightness.current = null;
  }, []);

  const openScanMode = useCallback(async () => {
    try {
      const { flushPendingBenefitRedemptionsForUser } = await import('@/lib/benefit-redemption-store');
      await flushPendingBenefitRedemptionsForUser(user.id, {
        phone: user.phoneNumber,
        email: user.email,
      });
    } catch (err) {
      console.warn('[FounderQr] flush pending:', err);
    }
    try {
      previousBrightness.current = await Brightness.getBrightnessAsync();
      await Brightness.setBrightnessAsync(SCAN_BRIGHTNESS);
    } catch {
      previousBrightness.current = null;
    }
    setExpanded(true);
  }, [user.id, user.phoneNumber, user.email]);

  const closeScanMode = useCallback(() => {
    setExpanded(false);
    void restoreBrightness();
  }, [restoreBrightness]);

  useEffect(() => () => { void restoreBrightness(); }, [restoreBrightness]);

  return (
    <>
      <View style={styles.card}>
        <View style={styles.accentBar} />
        <View style={styles.body}>
          <View style={styles.mainRow}>
            <View style={styles.leftCol}>
              <Text style={styles.brandMark}>THE LOOP</Text>
              <Text style={styles.brandSub}>Passe fondateur</Text>
              <Text style={styles.name} numberOfLines={2}>{displayName}</Text>
              {user.phoneNumber ? (
                <Text style={styles.phone} numberOfLines={1}>{user.phoneNumber}</Text>
              ) : null}
              <Text style={styles.metaLabel}>Accès</Text>
              <Text style={styles.metaValue}>Global · tous pays</Text>
              <Text style={styles.renewal}>QR · {qrWindowLabel}</Text>
            </View>

            <View style={styles.rightCol}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>★ FONDATEUR</Text>
              </View>
              <Pressable
                onPress={() => void openScanMode()}
                style={styles.qrFrame}
                accessibilityLabel="Agrandir le QR code"
                disabled={!isReady}
              >
                {isReady ? (
                  <QRCode value={qrValue} size={QR_SIZE_COMPACT} backgroundColor="#ffffff" color={BORDEAUX} />
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <Text style={styles.qrPlaceholderText}>…</Text>
                  </View>
                )}
                <Text style={styles.qrHint}>{isReady ? `${secondsLeft}s` : '…'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <Modal visible={expanded} animationType="fade" transparent onRequestClose={closeScanMode} statusBarTranslucent>
        <Pressable style={styles.scanOverlay} onPress={closeScanMode}>
          <Pressable style={styles.scanSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.scanKicker}>THE LOOP · Fondateur</Text>
            <Text style={styles.scanSubtitle} numberOfLines={1}>{displayName}</Text>
            <View style={styles.scanQrWrap}>
              {isReady ? (
                <QRCode key={`full-${qrValue}`} value={qrValue} size={QR_SIZE_FULL} backgroundColor="#ffffff" color={BORDEAUX} />
              ) : null}
            </View>
            <Text style={styles.scanCountdown}>Nouveau code dans {secondsLeft} s</Text>
            <Pressable style={styles.scanCloseBtn} onPress={closeScanMode}>
              <Text style={styles.scanCloseText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 6,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(142,22,49,0.2)',
    backgroundColor: CARD_BG,
    flexDirection: 'row',
    shadowColor: BORDEAUX,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  accentBar: { width: 4, backgroundColor: BORDEAUX },
  body: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  mainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  leftCol: { flex: 1, minWidth: 0 },
  rightCol: { alignItems: 'flex-end', gap: 4, marginTop: 18 },
  brandMark: { fontSize: 12, fontWeight: '900', letterSpacing: 2.5, color: BORDEAUX_TEXT },
  brandSub: { marginTop: 1, fontSize: 8, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: '#9CA3AF' },
  chip: {
    borderWidth: 1,
    borderColor: LOOP_GOLD,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  chipText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.6, color: BORDEAUX_TEXT },
  name: { marginTop: 8, fontSize: 17, fontWeight: '800', color: BORDEAUX, lineHeight: 20 },
  phone: { marginTop: 2, fontSize: 11, fontWeight: '500', color: '#6B7280' },
  metaLabel: { marginTop: 8, fontSize: 7, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#9CA3AF' },
  metaValue: { marginTop: 1, fontSize: 11, fontWeight: '700', color: BORDEAUX_TEXT },
  renewal: { marginTop: 4, fontSize: 8, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.4 },
  qrFrame: {
    marginTop: 10,
    borderRadius: 8,
    padding: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    alignItems: 'center',
  },
  qrPlaceholder: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  qrPlaceholderText: { fontSize: 18, color: '#D1D5DB' },
  qrHint: { marginTop: 1, fontSize: 7, fontWeight: '700', color: '#9CA3AF' },
  scanOverlay: { flex: 1, backgroundColor: 'rgba(107,15,36,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  scanSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  scanKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', color: BORDEAUX_TEXT },
  scanSubtitle: { marginTop: 8, fontSize: 18, fontWeight: '800', color: BORDEAUX, textAlign: 'center' },
  scanQrWrap: { marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(142,22,49,0.15)' },
  scanCountdown: { marginTop: 14, fontSize: 13, fontWeight: '700', color: BORDEAUX },
  scanCloseBtn: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, backgroundColor: BORDEAUX },
  scanCloseText: { color: CARD_BG, fontWeight: '700', fontSize: 14 },
});
