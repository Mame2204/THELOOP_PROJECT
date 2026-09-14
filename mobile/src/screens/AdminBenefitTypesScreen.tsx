import { AdminPageHeader } from '@/components/admin/AdminShell';
import { AdminBenefitTypesPanel } from '@/components/admin/AdminBenefitTypesPanel';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminBenefitTypes'>;

export function AdminBenefitTypesScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('benefit_types');

  if (role !== 'ADMIN' || (!allowed && !isLoading)) {
    return (
      <AdminModuleDenied
        shell={shell}
        moduleLabel={permissionLabel}
        onBack={() => navigation.goBack()}
      />
    );
  }

  if (role !== 'ADMIN' || !allowed) {
    return <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={{ padding: 16 }} />;
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <AdminPageHeader
        title="Types d'avantage"
        subtitle="Paramétrage super admin — mécaniques & libellés"
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminBenefitTypesPanel />
    </KeyboardAwareFormScroll>
  );
}
