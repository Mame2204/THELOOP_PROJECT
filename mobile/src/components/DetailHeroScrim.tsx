import { StyleSheet, View } from 'react-native';

/** Ombre portée pour textes sur photo — lisible sur fond clair ou foncé. */
export const detailHeroTextShadow = {
  textShadowColor: 'rgba(0,0,0,0.9)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 8,
} as const;

/**
 * Voiles bas pour titres / meta sur cover.
 * Listes un peu plus hautes ; détail un cran au-dessus ; spot détail un peu plus court.
 */
export const CATALOG_SCRIM_HEIGHT = '36%';
export const CATALOG_SCRIM_COLOR = 'rgba(0,0,0,0.40)';

export const DETAIL_SCRIM_HEIGHT = '37%';
export const DETAIL_SCRIM_COLOR = 'rgba(0,0,0,0.40)';

/** Spot détail : moins de lignes sous le titre → voile un peu plus court. */
export const SPOT_DETAIL_SCRIM_HEIGHT = '32%';
export const SPOT_DETAIL_SCRIM_COLOR = 'rgba(0,0,0,0.38)';

/** @deprecated préférer CATALOG_* / DETAIL_* */
export const COVER_SCRIM_HEIGHT = CATALOG_SCRIM_HEIGHT;
/** @deprecated préférer CATALOG_* / DETAIL_* */
export const COVER_SCRIM_COLOR = CATALOG_SCRIM_COLOR;

/** Voile bas — fiches détail (event, outil, parcours). */
export function DetailHeroScrim() {
  return <View style={styles.detailVeil} pointerEvents="none" />;
}

/** Voile bas — fiche spot (bloc 1 plus compact). */
export function SpotDetailHeroScrim() {
  return <View style={styles.spotDetailVeil} pointerEvents="none" />;
}

/** Voile bas — cartes catalogue / listes. */
export function CatalogCoverScrim() {
  return <View style={styles.catalogVeil} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  detailVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: DETAIL_SCRIM_HEIGHT,
    backgroundColor: DETAIL_SCRIM_COLOR,
  },
  spotDetailVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SPOT_DETAIL_SCRIM_HEIGHT,
    backgroundColor: SPOT_DETAIL_SCRIM_COLOR,
  },
  catalogVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CATALOG_SCRIM_HEIGHT,
    backgroundColor: CATALOG_SCRIM_COLOR,
  },
});
