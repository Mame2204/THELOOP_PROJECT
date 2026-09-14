import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, Share } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { PageHeader } from '@/components/PageHeader';
import { getProfileAccent } from '@/lib/profile-accent';
import { getReferralStats, type ReferralStats } from '@/lib/referral-store';
import { isAuthenticated } from '@/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Referral'>;

export function ReferralScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { shell, grade, theme } = useMemberTheme();
  const accent = getProfileAccent(role, shell, grade, theme);
  const isAdminReferrer = role === 'ADMIN';
  const [stats, setStats] = useState<ReferralStats | null>(null);

  const load = useCallback(async () => {
    if (!user || !isAuthenticated(role)) return;
    setStats(await getReferralStats(user.id, user));
  }, [user?.id, user?.referralCode, user?.phoneNumber, user?.email, role]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !isAuthenticated(role)) {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Connectez-vous pour accéder au parrainage.</Text>
      </View>
    );
  }

  async function shareCode() {
    if (!stats?.referralCode) return;
    try {
      await Share.share({
        message: `Rejoins THE LOOP avec mon code parrain : ${stats.referralCode}`,
      });
    } catch {
      Alert.alert('Code parrain', stats.referralCode);
    }
  }

  const progress = stats
    ? stats.progressToNextReward / stats.referralsPerReward
    : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <PageHeader title="Parrainage" shell={shell} onBack={() => navigation.goBack()} />

      <View style={[styles.hero, { borderColor: accent.accentBorder, backgroundColor: accent.accentSoft }]}>
        <Text style={[styles.heroKicker, { color: accent.accent }]}>Votre code parrain</Text>
        <Text style={[styles.heroCode, { color: accent.accent }]}>{stats?.referralCode ?? '…'}</Text>
        <Text style={[styles.heroHint, { color: shell.pageKicker }]}>
          Partagez ce code lors de l'inscription de vos contacts.
        </Text>
        <Pressable style={[styles.copyBtn, { backgroundColor: shell.tabIndicator }]} onPress={() => void shareCode()}>
          <Text style={styles.copyBtnText}>Partager mon code</Text>
        </Pressable>
      </View>

      {!isAdminReferrer ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Récompense</Text>
          <Text style={[styles.body, { color: shell.pageTitle }]}>
            Tous les {stats?.referralsPerReward ?? 10} comptes créés avec votre code, vous recevez{' '}
            {stats?.rewardMonths ?? 1} mois Prime gratuit.
          </Text>
          <Text style={[styles.body, { color: shell.pageKicker, marginTop: 6 }]}>
            Maximum {stats?.maxRewardMonthsPerYear ?? 5} mois offerts par an.
          </Text>
        </>
      ) : (
        <Text style={[styles.adminNote, { color: shell.pageKicker }]}>
          Compte administrateur : suivi des filleuls et statistiques uniquement, sans récompense Prime.
        </Text>
      )}

      <Text style={[styles.section, { color: shell.pageKicker }]}>Progression {new Date().getFullYear()}</Text>
      {!isAdminReferrer ? (
        <>
          <View style={[styles.progressTrack, { backgroundColor: shell.filterInactiveBg }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: shell.tabIndicator }]} />
          </View>
          <Text style={[styles.progressLabel, { color: shell.pageTitle }]}>
            {stats?.progressToNextReward ?? 0} / {stats?.referralsPerReward ?? 10} vers le prochain mois offert
          </Text>
        </>
      ) : (
        <Text style={[styles.progressLabel, { color: shell.pageTitle }]}>
          {stats?.referralsThisYear ?? 0} filleul{(stats?.referralsThisYear ?? 0) > 1 ? 's' : ''} cette année
        </Text>
      )}

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.statValue, { color: shell.pageTitle }]}>{stats?.referralsThisYear ?? 0}</Text>
          <Text style={[styles.statLabel, { color: shell.pageKicker }]}>Filleuls cette année</Text>
        </View>
        {!isAdminReferrer ? (
          <>
            <View style={[styles.statCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
              <Text style={[styles.statValue, { color: accent.accent }]}>{stats?.monthsGrantedThisYear ?? 0}</Text>
              <Text style={[styles.statLabel, { color: shell.pageKicker }]}>Mois Prime obtenus</Text>
            </View>
            <View style={[styles.statCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
              <Text style={[styles.statValue, { color: shell.pageTitle }]}>{stats?.monthsRemainingThisYear ?? 0}</Text>
              <Text style={[styles.statLabel, { color: shell.pageKicker }]}>Mois restants / an</Text>
            </View>
          </>
        ) : (
          <View style={[styles.statCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            <Text style={[styles.statValue, { color: accent.accent }]}>{stats?.totalReferrals ?? 0}</Text>
            <Text style={[styles.statLabel, { color: shell.pageKicker }]}>Total filleuls</Text>
          </View>
        )}
      </View>

      <Text style={[styles.totalMeta, { color: shell.pageKicker }]}>
        Total filleuls depuis l'ouverture : {stats?.totalReferrals ?? 0}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center' },
  heroKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  heroCode: { marginTop: 10, fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  heroHint: { marginTop: 8, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  copyBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  copyBtnText: { fontWeight: '800', color: '#000' },
  section: { marginTop: 24, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  body: { fontSize: 14, lineHeight: 21 },
  adminNote: { marginTop: 20, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { marginTop: 8, fontSize: 13, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { marginTop: 4, fontSize: 9, textAlign: 'center', fontWeight: '600' },
  totalMeta: { marginTop: 16, fontSize: 12, textAlign: 'center' },
});
