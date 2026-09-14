import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoopLogo } from '@/components/LoopLogo';

export type AdminSidebarKey =
  | 'accueil'
  | 'appTabs'
  | 'loop'
  | 'content'
  | 'insights'
  | 'users'
  | 'demandes'
  | 'partnerships'
  | 'suggestions'
  | 'benefits'
  | 'staff'
  | 'draw'
  | 'moderation'
  | 'pass'
  | 'settings';

export interface AdminSidebarItem {
  key: AdminSidebarKey;
  icon: string;
  label: string;
  badge?: number;
}

interface AdminSidebarProps {
  items: AdminSidebarItem[];
  activeKey: AdminSidebarKey;
  onSelect: (key: AdminSidebarKey) => void;
}

/** Mini barre verticale noire — cercle + THE LOOP en dessous (non cliquable). */
export function AdminSidebar({ items, activeKey, onSelect }: AdminSidebarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 6) }]}>
      <View style={styles.rail}>
        <View style={styles.brand} accessibilityLabel="THE LOOP">
          <LoopLogo variant="light" size="sm" showWordmark={false} showTagline={false} />
          <Text style={styles.brandName} numberOfLines={2}>
            THE{'\n'}LOOP
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => {
            const active = item.key === activeKey;
            return (
              <Pressable
                key={item.key}
                onPress={() => onSelect(item.key)}
                style={({ pressed }) => [
                  styles.item,
                  active && styles.itemActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={item.label}
              >
                <View style={styles.iconWrap}>
                  <Text style={[styles.icon, active && styles.iconActive]}>{item.icon}</Text>
                  {item.badge != null && item.badge > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge > 9 ? '9+' : item.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.label, active && styles.labelActive]} numberOfLines={2}>
                  {item.key === 'loop' ? `THE${'\n'}LOOP` : item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export const ADMIN_SIDEBAR_WIDTH = 64;

const styles = StyleSheet.create({
  wrap: {
    width: ADMIN_SIDEBAR_WIDTH + 8,
    paddingLeft: 4,
    paddingRight: 4,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  rail: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  brandName: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
    textTransform: 'uppercase',
    lineHeight: 9,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    gap: 1,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 10,
  },
  itemActive: {
    backgroundColor: '#ffffff',
  },
  pressed: {
    opacity: 0.85,
  },
  iconWrap: {
    position: 'relative',
  },
  icon: {
    fontSize: 14,
    lineHeight: 16,
    textAlign: 'center',
  },
  iconActive: {
    opacity: 1,
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 7,
    fontWeight: '700',
    lineHeight: 9,
    textAlign: 'center',
  },
  labelActive: {
    color: '#000000',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    paddingHorizontal: 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#000000',
    fontSize: 7,
    fontWeight: '800',
  },
});
