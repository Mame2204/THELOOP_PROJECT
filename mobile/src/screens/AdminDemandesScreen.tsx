import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { AdminPartnershipsScreen } from '@/screens/AdminPartnershipsScreen';
import { AdminModerationScreen } from '@/screens/AdminModerationScreen';
import { AdminSuggestionsScreen } from '@/screens/AdminSuggestionsScreen';
import type { AdminPanelParamList, RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AdminPanelParamList & RootStackParamList, 'AdminDemandes'>;

type DemandFilter = 'partnerships' | 'moderation' | 'ideas';

/**
 * Hub Demandes — fusion Partenariats / Modération / Idées avec filtre en tête.
 */
export function AdminDemandesScreen({ navigation, route }: Props) {
  const { shell } = useMemberTheme();
  const { hasPermission } = useAdminPermissions();

  const available = useMemo(() => {
    const tabs: { id: DemandFilter; label: string }[] = [];
    if (hasPermission('partnerships')) tabs.push({ id: 'partnerships', label: 'Partenariats' });
    if (hasPermission('moderation')) tabs.push({ id: 'moderation', label: 'Modération' });
    if (hasPermission('suggestions')) tabs.push({ id: 'ideas', label: 'Idées' });
    return tabs;
  }, [hasPermission]);

  const initial: DemandFilter =
    route.params?.filter && available.some((t) => t.id === route.params?.filter)
      ? route.params.filter
      : available[0]?.id ?? 'partnerships';

  const [filter, setFilter] = useState<DemandFilter>(initial);

  const onChangeFilter = useCallback((id: DemandFilter) => {
    setFilter(id);
  }, []);

  const embeddedNav = navigation as unknown as NativeStackScreenProps<
    RootStackParamList,
    'AdminPartnerships'
  >['navigation'];

  return (
    <View style={{ flex: 1, backgroundColor: shell.pageBg }}>
      <View style={{ paddingHorizontal: 16 }}>
        <AdminPageHeader
          title="Demandes"
          subtitle="Partenariats · Modération · Idées"
          shell={shell}
          onBack={() => navigation.goBack()}
        />
        <AdminCountryBar shell={shell} compact />
        {available.length > 1 ? (
          <AdminTabMenu
            tabs={available}
            active={filter}
            onChange={(id) => onChangeFilter(id as DemandFilter)}
            shell={shell}
          />
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        {filter === 'partnerships' && hasPermission('partnerships') ? (
          <AdminPartnershipsScreen
            navigation={embeddedNav}
            route={{ key: 'embedded-partnerships', name: 'AdminPartnerships', params: { embedded: true } }}
          />
        ) : null}
        {filter === 'moderation' && hasPermission('moderation') ? (
          <AdminModerationScreen
            navigation={embeddedNav as never}
            route={{
              key: 'embedded-moderation',
              name: 'AdminModeration',
              params: { embedded: true, tab: 'all' },
            }}
          />
        ) : null}
        {filter === 'ideas' && hasPermission('suggestions') ? (
          <AdminSuggestionsScreen
            navigation={embeddedNav as never}
            route={{ key: 'embedded-ideas', name: 'AdminSuggestions', params: { embedded: true } }}
          />
        ) : null}
      </View>
    </View>
  );
}
