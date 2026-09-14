import { ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PageHeader } from '@/components/PageHeader';
import { PrimeBenefitsSection } from '@/components/PrimeBenefitsSection';
import { useAuthContext } from '@/context/AuthContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { getCountryLabel } from '@/lib/countries';
import { getProfileAccent } from '@/lib/profile-accent';
import { isSuperAdminAccount } from '@/lib/role-benefit-eligibility';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyBenefits'>;

export function MyBenefitsScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { shell, grade, theme } = useMemberTheme();
  const accent = getProfileAccent(role, shell, grade, theme);
  const { viewingCountryCode, isExploringOtherCountry } = useViewingCountry();

  const isSuperAdmin = user ? isSuperAdminAccount(user) : false;

  if (!user) return null;

  const hint = isExploringOtherCountry
    ? `Privilèges ${getCountryLabel(viewingCountryCode)} · statut membre / PASS valable partout`
    : `${getCountryLabel(viewingCountryCode)} · statut membre / PASS valable partout`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <PageHeader title="Mes privilèges" shell={shell} onBack={() => navigation.goBack()} />

      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        {hint}
        {isSuperAdmin ? ' · octroi TEAMS dans Control Tower' : ''}
      </Text>
      <PrimeBenefitsSection
        key={viewingCountryCode}
        userId={user.id}
        phone={user.phoneNumber}
        email={user.email}
        user={user}
        shell={shell}
        showEmpty
        activeAccent={accent.accent}
        filterCountryCode={viewingCountryCode}
        emptyMessage={
          isExploringOtherCountry
            ? `Aucun privilège actif pour ${getCountryLabel(viewingCountryCode)}. Les offres que vous gagnez dans ce pays apparaîtront ici.`
            : `Aucun privilège actif pour ${getCountryLabel(viewingCountryCode)}.`
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 40 },
  hint: { fontSize: 12, marginBottom: 8, fontStyle: 'italic', lineHeight: 18 },
});
