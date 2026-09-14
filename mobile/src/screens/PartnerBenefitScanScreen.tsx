import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { resolveMemberFromRotatingQrDetailed } from '@/lib/member-qr-scan';
import {
  establishmentTypeLabel,
  listPartnerEstablishments,
  type PartnerEstablishment,
} from '@/lib/partner-establishments';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerBenefitScan'>;

export function PartnerBenefitScanScreen({ navigation, route }: Props) {
  const { partnerId, partnerName, partnerCode, establishmentId, establishmentType, establishmentTitle } = route.params;
  const { shell } = useMemberTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [manualPayload, setManualPayload] = useState('');
  const [showManual] = useState(__DEV__);
  const [establishments, setEstablishments] = useState<PartnerEstablishment[]>([]);
  const [establishmentsLoading, setEstablishmentsLoading] = useState(true);
  const lastPayloadRef = useRef('');
  const [selected, setSelected] = useState<PartnerEstablishment | null>(
    establishmentId && establishmentType && establishmentTitle
      ? { id: establishmentId, type: establishmentType, title: establishmentTitle, status: 'active' }
      : null,
  );

  useEffect(() => {
    let cancelled = false;
    setEstablishmentsLoading(true);
    const loadingCap = setTimeout(() => {
      if (!cancelled) setEstablishmentsLoading(false);
    }, 5000);

    void listPartnerEstablishments(partnerId, partnerName, { lightweight: true })
      .then((rows) => {
        if (cancelled) return;
        setEstablishments(rows);
        if (!selected && rows.length === 1) setSelected(rows[0]);
      })
      .catch(() => {
        if (!cancelled) setEstablishments([]);
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(loadingCap);
          setEstablishmentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(loadingCap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected volontairement exclu pour éviter une boucle
  }, [partnerId, partnerName]);

  const processPayload = useCallback(
    async (payload: string) => {
      if (processing) return;
      if (establishments.length > 1 && !selected) {
        Alert.alert('Sélection requise', 'Choisissez l\'événement, le spot ou l\'outil concerné avant de scanner.');
        return;
      }
      setProcessing(true);
      setScanningEnabled(false);
      try {
        const result = await resolveMemberFromRotatingQrDetailed(payload);
        const member = result.member;
        if (!member) {
          const hints: Record<string, string> = {
            invalid_format: 'Le QR lu n\'a pas le bon format. Utilisez le QR agrandi (pas une capture du petit QR).',
            expired_or_invalid: 'Code expiré. Regénérez le QR sur la carte membre (compte à rebours) et réessayez.',
            rpc_error:
              result.detail ??
              'Serveur Supabase indisponible. Exécutez la migration 20260743_qr_scan_partner_rpc.sql puis réessayez.',
            user_not_found: 'Membre introuvable en base.',
            user_inactive: 'Compte membre inactif.',
          };
          const hint = result.reason ? hints[result.reason] : undefined;
          const title = result.reason === 'rpc_error' ? 'Scan indisponible' : 'QR invalide';
          Alert.alert(
            title,
            hint ?? 'Ce QR code n\'est pas reconnu. Demandez au membre d\'actualiser sa carte.',
            [{ text: 'OK', onPress: () => setScanningEnabled(true) }],
          );
          if (__DEV__ && result.detail) console.warn('[QR scan]', result.reason, result.detail);
          return;
        }
        if (!member.isVerified) {
          Alert.alert('Compte non vérifié', 'Ce compte membre n\'est pas actif.', [
            { text: 'OK', onPress: () => setScanningEnabled(true) },
          ]);
          return;
        }
        navigation.replace('PartnerBenefitConfirm', {
          partnerId,
          partnerName,
          partnerCode,
          memberUserId: member.userId,
          memberFirstName: member.firstName,
          memberLastName: member.lastName,
          memberPhone: member.phoneNumber,
          memberRole: member.role,
          establishmentId: selected?.id,
          establishmentType: selected?.type,
          establishmentTitle: selected?.title,
        });
      } finally {
        setProcessing(false);
      }
    },
    [
      establishments.length,
      navigation,
      partnerCode,
      partnerId,
      partnerName,
      processing,
      selected,
    ],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (!scanningEnabled || processing || !data) return;
      const trimmed = data.trim();
      if (!trimmed || trimmed === lastPayloadRef.current) return;
      lastPayloadRef.current = trimmed;
      void processPayload(trimmed);
    },
    [processPayload, processing, scanningEnabled],
  );

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Chargement caméra…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.title, { color: shell.pageTitle }]}>Accès caméra requis</Text>
        <Text style={[styles.body, { color: shell.pageKicker }]}>
          Autorisez la caméra pour scanner le QR code membre THE LOOP.
        </Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnText}>Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanningEnabled && !processing ? onBarcodeScanned : undefined}
      />
      <View style={styles.overlay}>
        <Text style={styles.partner}>{partnerName}</Text>
        {selected ? (
          <Text style={styles.establishment}>
            {establishmentTypeLabel(selected.type)} · {selected.title}
          </Text>
        ) : establishments.length > 1 ? (
          <Text style={styles.establishment}>Choisissez un établissement ci-dessous</Text>
        ) : establishmentsLoading ? (
          <Text style={styles.establishment}>Chargement des contenus…</Text>
        ) : establishments.length === 0 ? (
          <Text style={styles.establishment}>Validation membre — avantages en attente affichés après scan</Text>
        ) : null}
        <Text style={styles.hint}>Scannez le QR code agrandi — identification membre ou validation d'avantage</Text>
        {establishments.length > 1 && !establishmentId ? (
          <View style={styles.estPicker}>
            {establishments.map((est) => (
              <Pressable
                key={`${est.type}-${est.id}`}
                style={[styles.estChip, selected?.id === est.id && selected.type === est.type && styles.estChipActive]}
                onPress={() => setSelected(est)}
              >
                <Text style={styles.estChipText}>{establishmentTypeLabel(est.type)} · {est.title}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={[styles.frame, { borderColor: shell.tabIndicator }]} />
        {showManual ? (
          <View style={styles.manualBox}>
            <Text style={styles.manualTitle}>Test 1 téléphone</Text>
            <TextInput
              style={styles.manualInput}
              value={manualPayload}
              onChangeText={setManualPayload}
              placeholder="Coller le code LOOP-…"
              placeholderTextColor="rgba(255,255,255,0.5)"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Pressable
              style={styles.manualBtn}
              onPress={() => {
                if (manualPayload.trim()) void processPayload(manualPayload.trim());
              }}
            >
              <Text style={styles.manualBtnText}>Valider le code collé</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable style={styles.cancel} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  body: { marginTop: 8, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 16, backgroundColor: '#10b981', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' },
  partner: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  establishment: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  estPicker: { width: '100%', maxWidth: 320, gap: 6, marginBottom: 12 },
  estChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  estChipActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.25)' },
  estChipText: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 24, textAlign: 'center' },
  frame: { width: 240, height: 240, borderWidth: 3, borderRadius: 16, backgroundColor: 'transparent' },
  manualBox: { marginTop: 16, width: '100%', maxWidth: 320, gap: 8 },
  manualTitle: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  manualInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  manualBtn: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.85)' },
  manualBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cancel: { marginTop: 28, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  cancelText: { color: '#fff', fontWeight: '700' },
});
