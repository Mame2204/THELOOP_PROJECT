import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNotifications } from '@/context/NotificationsContext';
import { useAuthContext } from '@/context/AuthContext';
import { useFavoritesSignup } from '@/context/FavoritesSignupContext';
import { isAuthenticated } from '@/types';
import type { RootStackParamList } from '@/navigation/types';

interface MemberHeaderActionsProps {
  /** @deprecated Taille unifiée — ignoré. */
  compact?: boolean;
  showSearch?: boolean;
  searchOpen?: boolean;
  onSearchToggle?: () => void;
}

/** Loupe + cloche — le profil est dans la barre du bas. */
export function MemberHeaderActions({
  showSearch = false,
  searchOpen = false,
  onSearchToggle,
}: MemberHeaderActionsProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { unreadCount } = useNotifications();
  const { role } = useAuthContext();
  const { openSignupSheet } = useFavoritesSignup();
  const loggedIn = isAuthenticated(role);

  return (
    <View style={styles.row}>
      {showSearch && onSearchToggle ? (
        <Pressable
          hitSlop={10}
          style={[styles.iconBtn, searchOpen && styles.iconBtnActive]}
          onPress={onSearchToggle}
          accessibilityLabel={searchOpen ? 'Fermer la recherche' : 'Rechercher'}
        >
          <Text style={styles.icon}>{searchOpen ? '✕' : '🔍'}</Text>
        </Pressable>
      ) : null}

      <Pressable
        hitSlop={10}
        style={styles.iconBtn}
        onPress={() => {
          if (!loggedIn) {
            openSignupSheet(navigation);
            return;
          }
          navigation.navigate('Notifications');
        }}
        accessibilityLabel="Notifications"
      >
        <Text style={styles.bellIcon}>🔔</Text>
        {loggedIn && unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { position: 'relative', padding: 4 },
  iconBtnActive: { opacity: 0.85 },
  icon: { fontSize: 17 },
  bellIcon: { fontSize: 19 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
