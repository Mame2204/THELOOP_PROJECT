import { type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemberTheme } from '@/hooks/useMemberTheme';

type NavProps = {
  navigation: { goBack: () => void };
};

/**
 * Enveloppe une fiche détail en grande popup (fond dimmé + feuille ~94 %).
 * Ne modifie pas le contenu interne de l’écran.
 */
export function withDetailPopup<P extends NavProps>(Screen: ComponentType<P>): ComponentType<P> {
  function DetailPopupScreen(props: P) {
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const { shell } = useMemberTheme();
    const maxHeight = Math.round(height * 0.94);

    return (
      <View style={styles.root} pointerEvents="box-none" collapsable={false}>
        <Pressable
          style={styles.backdrop}
          onPress={() => props.navigation.goBack()}
          accessibilityLabel="Fermer"
          collapsable={false}
        />
        <View
          collapsable={false}
          style={[
            styles.sheet,
            {
              backgroundColor: shell.pageBg,
              height: maxHeight,
              paddingTop: Math.max(insets.top * 0.35, 6),
              paddingBottom: Math.max(insets.bottom, 6),
            },
          ]}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: shell.filterInactiveBorder }]} />
            <Pressable
              onPress={() => props.navigation.goBack()}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Text style={[styles.closeText, { color: shell.pageKicker }]}>Fermer</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            <Screen {...props} />
          </View>
        </View>
      </View>
    );
  }

  DetailPopupScreen.displayName = `withDetailPopup(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return DetailPopupScreen;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    width: '100%',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
    minHeight: 28,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  closeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
});
