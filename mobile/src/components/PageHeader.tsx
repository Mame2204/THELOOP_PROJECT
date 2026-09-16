import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoopLogo } from '@/components/LoopLogo';
import { MemberHeaderActions } from '@/components/MemberHeaderActions';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { navigateRoot } from '@/lib/navigation-utils';
import {
  CONTENT_H_PADDING,
  TAB_HEADER_LOGO_SIZE,
  TAB_HEADER_PANEL_MARGIN_BOTTOM,
  TAB_HEADER_PANEL_PADDING_H,
  TAB_HEADER_PANEL_PADDING_V,
  TAB_HEADER_SAFE_TOP_MIN,
  TAB_HEADER_WRAP_PADDING_BOTTOM,
} from '@/constants/layout';
import type { ShellTheme } from '@/lib/member-grade-theme';
import type { UserRole } from '@/types';

interface PageHeaderProps {
  title: string;
  shell: ShellTheme;
  onBack?: () => void;
  showBrand?: boolean;
  /** @deprecated Taille unifiée sur tous les onglets — ignoré. */
  compact?: boolean;
  /** Affiche la loupe à côté de la cloche. */
  showSearchToggle?: boolean;
  searchOpen?: boolean;
  onSearchToggle?: () => void;
  /** Force l'ouverture validation via logo (défaut : sans compte uniquement). */
  logoOpensPartnerValidation?: boolean;
}

function defaultLogoOpensPartnerValidation(role: UserRole): boolean {
  return role === 'USER_ANONYMOUS';
}

/** En-tête marque + titre — même gabarit sur Accueil, Agenda, Spots, Outils, Favoris, Profil. */
export function PageHeader({
  title,
  shell,
  onBack,
  showBrand = true,
  showSearchToggle = false,
  searchOpen = false,
  onSearchToggle,
  logoOpensPartnerValidation,
}: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { theme } = useMemberTheme();
  const { role } = useAuthContext();

  const openPartnerValidation =
    logoOpensPartnerValidation ?? defaultLogoOpensPartnerValidation(role);

  function handleLogoPress(): void {
    navigateRoot(navigation, 'PartnerValidationCode');
  }

  const logo = <LoopLogo variant="app" size={TAB_HEADER_LOGO_SIZE} showTagline={false} />;

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: Math.max(insets.top, TAB_HEADER_SAFE_TOP_MIN), paddingHorizontal: CONTENT_H_PADDING },
      ]}
    >
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.backRow}>
          <Text style={[styles.back, { color: theme.colors.accentDeep }]}>← Retour</Text>
        </Pressable>
      ) : null}

      {showBrand ? (
        <View
          style={[
            styles.headerPanel,
            theme.elevation.card,
            {
              backgroundColor: theme.atmosphere.headerPanelBg,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.header,
            },
          ]}
        >
          <View style={styles.brandRow}>
            {openPartnerValidation ? (
              <Pressable
                onPress={handleLogoPress}
                hitSlop={8}
                accessibilityLabel="Validation partenaire"
                accessibilityRole="button"
              >
                {logo}
              </Pressable>
            ) : (
              logo
            )}
            <MemberHeaderActions
              showSearch={showSearchToggle}
              searchOpen={searchOpen}
              onSearchToggle={onSearchToggle}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <Text
          style={[
            styles.title,
            {
              color: shell.pageTitle,
              fontSize: theme.typography.pageTitleSize,
              fontWeight: theme.typography.titleWeight,
            },
          ]}
        >
          {title}
        </Text>
        <View style={[styles.titleAccent, { backgroundColor: theme.colors.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: TAB_HEADER_WRAP_PADDING_BOTTOM },
  backRow: { marginBottom: 8 },
  back: { fontSize: 13, fontWeight: '700' },
  headerPanel: {
    marginBottom: TAB_HEADER_PANEL_MARGIN_BOTTOM,
    paddingHorizontal: TAB_HEADER_PANEL_PADDING_H,
    paddingVertical: TAB_HEADER_PANEL_PADDING_V,
    borderWidth: 1,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBlock: { gap: 6 },
  title: { letterSpacing: -0.4 },
  titleAccent: { height: 3, width: 40, borderRadius: 999 },
});
