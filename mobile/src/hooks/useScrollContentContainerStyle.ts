import { useMemo } from 'react';
import { useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HERO_COLLAPSE_SCROLL,
  SCROLL_OVERFLOW_BUFFER,
  TAB_BAR_ESTIMATE,
} from '@/constants/layout';

export interface ScrollContentContainerOptions {
  /** Hauteur estimée du bloc fixe au-dessus du scroll (header, hero, filtres…). */
  stickyHeaderEstimate?: number;
  /** Inclure la tab bar dans le calcul (écrans principaux à onglets). */
  includeTabBar?: boolean;
  paddingBottom?: number;
}

/**
 * Garantit un contenu scrollable même lorsque des blocs conditionnels sont absents
 * (ex. Walks, Corner, sondage) — évite un ScrollView/FlatList « bloqué ».
 */
export function useScrollContentContainerStyle(
  baseStyle?: StyleProp<ViewStyle>,
  options: ScrollContentContainerOptions = {},
): StyleProp<ViewStyle> {
  const {
    stickyHeaderEstimate = 280,
    includeTabBar = false,
    paddingBottom,
  } = options;
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const chrome =
      insets.top +
      insets.bottom +
      stickyHeaderEstimate +
      (includeTabBar ? TAB_BAR_ESTIMATE : 0);
    const viewport = Math.max(windowHeight - chrome, 200);
    const minHeight = viewport + HERO_COLLAPSE_SCROLL + SCROLL_OVERFLOW_BUFFER;

    const minStyle: ViewStyle = {
      flexGrow: 1,
      minHeight,
    };
    if (paddingBottom != null) {
      minStyle.paddingBottom = paddingBottom;
    }

    return baseStyle ? [minStyle, baseStyle] : minStyle;
  }, [
    baseStyle,
    windowHeight,
    insets.top,
    insets.bottom,
    stickyHeaderEstimate,
    includeTabBar,
    paddingBottom,
  ]);
}
