import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Brightness from 'expo-brightness';
import QRCode from 'react-native-qrcode-svg';
import { FounderPassCard } from '@/components/FounderPassCard';
import { LoopLogo } from '@/components/LoopLogo';
import { PrimeBadge } from '@/components/PrimeBadge';
import { AdminBadge } from '@/components/AdminBadge';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useRotatingQrPayload } from '@/hooks/useRotatingQrPayload';
import { getProfileAccent, type ProfileAccent } from '@/lib/profile-accent';
import { formatRotatingQrWindowLabel, shortUserId } from '@/lib/rotating-qr-token';
import type { ShellTheme } from '@/lib/theme-config';
import type { User, UserRole } from '@/types';
import type { MemberGrade } from '@/lib/theme-config';

type CardPalette = {
  bg: string;
  border: string;
  brand: string;
  text: string;
  muted: string;
  badgeBg: string;
  badgeText: string;
  qrBg: string;
  qrFg: string;
  subtitle: string;
};

interface MemberQrCardProps {
  user: User;
  role: UserRole;
  grade: MemberGrade;
  /** Active la rotation uniquement quand l'écran profil est visible. */
  rotationActive?: boolean;
}

const SCAN_BRIGHTNESS = 1;
/** Taille compacte carte membre (profil). */
const QR_SIZE_COMPACT = 92;
const QR_SIZE_FULL = 280;

function roleLabel(role: UserRole, grade: MemberGrade, userRole?: string | null): string {
  if (userRole === 'super_admin') return 'SUPER ADMIN';
  if (role === 'USER_PRIME' || grade === 'prime') return 'ABONNEMENT - PRIME';
  if (role === 'ADMIN' || grade === 'admin') return 'ADMIN';
  if (role === 'PARTNER' || grade === 'partner') return 'PARTENAIRE';
  return 'MEMBRE - GRATUIT';
}

function cardSubtitle(grade: MemberGrade): string {
  if (grade === 'prime') return 'Carte membre Prime';
  if (grade === 'partner') return 'Carte partenaire';
  if (grade === 'admin') return 'Carte admin';
  return 'Carte membre officielle';
}

function cardPaletteFromAccent(accent: ProfileAccent, shell: ShellTheme, grade: MemberGrade): CardPalette {
  const darkerBg = `${accent.accent}38`;
  return {
    bg: darkerBg,
    border: accent.accentBorder,
    brand: accent.accent,
    text: shell.pageTitle,
    muted: shell.pageKicker,
    badgeBg: `${accent.accent}28`,
    badgeText: accent.accent,
    qrBg: '#ffffff',
    qrFg: '#0a0a0a',
    subtitle: cardSubtitle(grade),
  };
}

export function MemberQrCard({ user, role, grade, rotationActive = true }: MemberQrCardProps) {
  const { shell, theme } = useMemberTheme();
  const accent = getProfileAccent(role, shell, grade, theme);
  const secret = user.qrCodeToken?.trim() || `LOOP-${shortUserId(user.id)}`;

  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [expanded, setExpanded] = useState(false);
  const previousBrightness = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
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
    // Avant d’afficher le QR : pousser les demandes « Utiliser » encore locales vers Supabase
    try {
      const { flushPendingBenefitRedemptionsForUser } = await import('@/lib/benefit-redemption-store');
      await flushPendingBenefitRedemptionsForUser(user.id, {
        phone: user.phoneNumber,
        email: user.email,
      });
    } catch (err) {
      console.warn('[MemberQr] flush pending:', err);
    }
    try {
      const current = await Brightness.getBrightnessAsync();
      previousBrightness.current = current;
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

  useEffect(() => {
    return () => {
      void restoreBrightness();
    };
  }, [restoreBrightness]);

  if (user.userRole === 'super_admin') {
    return <FounderPassCard user={user} rotationActive={rotationActive} />;
  }

  const palette = cardPaletteFromAccent(accent, shell, grade);
  const isAdmin = role === 'ADMIN';
  const isPrime = !isAdmin && (role === 'USER_PRIME' || grade === 'prime');
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.fullName || 'Membre';

  return (
    <>
      <View style={[styles.card, { backgroundColor: palette.bg, borderColor: palette.border }]}>
        <View style={styles.cardBody}>
          <View style={styles.topRow}>
            <View style={styles.info}>
              <LoopLogo variant="app" size="sm" showTagline={false} />
              <Text style={[styles.subtitle, { color: palette.muted }]}>{palette.subtitle}</Text>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>{displayName}</Text>
                {isAdmin ? <AdminBadge size="md" isSuperAdmin={false} /> : null}
                {isPrime ? <PrimeBadge size="md" /> : null}
              </View>
              {user.phoneNumber ? (
                <Text style={[styles.line, { color: palette.muted }]} numberOfLines={1}>{user.phoneNumber}</Text>
              ) : null}
              <View style={[styles.badge, { backgroundColor: palette.badgeBg }]}>
                <Text style={[styles.badgeText, { color: palette.badgeText }]}>{roleLabel(role, grade, user.userRole)}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => void openScanMode()}
              style={[styles.qrFrame, { backgroundColor: palette.qrBg }]}
              accessibilityLabel="Agrandir le QR code pour le scan"
              disabled={!isReady}
            >
            {isReady ? (
              <QRCode
                key={qrValue}
                value={qrValue}
                size={QR_SIZE_COMPACT}
                backgroundColor={palette.qrBg}
                color={palette.qrFg}
              />
            ) : (
              <View style={styles.qrPlaceholder}>
                <Text style={styles.qrPlaceholderText}>…</Text>
              </View>
            )}
            <Text style={styles.qrHint}>
              {isReady ? `Agrandir · ${secondsLeft}s` : 'Chargement…'}
            </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal
        visible={expanded}
        animationType="fade"
        transparent
        onRequestClose={closeScanMode}
        statusBarTranslucent
      >
        <Pressable style={styles.scanOverlay} onPress={closeScanMode}>
          <Pressable style={styles.scanSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.scanTitle}>Présentez ce code</Text>
            <Text style={styles.scanSubtitle} numberOfLines={1}>{displayName}</Text>
            <View style={styles.scanQrWrap}>
              {isReady ? (
                <QRCode
                  key={`full-${qrValue}`}
                  value={qrValue}
                  size={QR_SIZE_FULL}
                  backgroundColor="#ffffff"
                  color="#000000"
                />
              ) : null}
            </View>
            <Text style={styles.scanCountdown}>
              Nouveau code dans {secondsLeft} s
            </Text>
            <Text style={styles.scanHint}>Luminosité maximale · valide {qrWindowLabel}</Text>
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
    borderWidth: 1,
    borderRadius: 18,
    marginTop: 8,
    overflow: 'hidden',
  },
  cardBody: { padding: 16 },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  info: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 8, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  nameRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 18, fontWeight: '800' },
  line: { marginTop: 4, fontSize: 12, fontWeight: '500' },
  badge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  qrFrame: { borderRadius: 12, padding: 8, alignItems: 'center' },
  qrPlaceholder: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  qrPlaceholderText: { fontSize: 24, color: '#9ca3af', fontWeight: '300' },
  qrHint: { marginTop: 4, fontSize: 8, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  token: { marginTop: 12, textAlign: 'center', fontSize: 9, fontWeight: '600', letterSpacing: 1.5 },
  devPayload: { marginTop: 8, textAlign: 'center', fontSize: 8, lineHeight: 12, fontFamily: 'monospace' },
  scanOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scanSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  scanTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', color: '#6b7280' },
  scanSubtitle: { marginTop: 6, fontSize: 18, fontWeight: '800', color: '#0a0a0a', textAlign: 'center' },
  scanQrWrap: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  scanCountdown: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#0a0a0a',
    textAlign: 'center',
  },
  scanHint: { marginTop: 6, fontSize: 11, color: '#9ca3af', textAlign: 'center' },
  scanCloseBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
  },
  scanCloseText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
