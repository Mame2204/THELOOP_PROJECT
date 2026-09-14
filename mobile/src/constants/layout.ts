/** Padding horizontal commun (recherche, à la une, cartes, en-tête). */
export const CONTENT_H_PADDING = 16;

/** Hauteur visuelle unique de la bande logo + actions (tous les onglets). */
export const TAB_HEADER_LOGO_SIZE = 'md' as const;
export const TAB_HEADER_PANEL_PADDING_V = 8;
export const TAB_HEADER_PANEL_PADDING_H = 11;
export const TAB_HEADER_PANEL_MARGIN_BOTTOM = 8;
export const TAB_HEADER_WRAP_PADDING_BOTTOM = 8;
export const TAB_HEADER_SAFE_TOP_MIN = 8;

/** Espace entre la barre de recherche et le slider « À la une ». */
export const SEARCH_TO_HERO_GAP = 14;

/** Hauteur image des cartes catalogue (événements, spots, outils, walks, favoris). */
export const CATALOG_CARD_IMAGE_HEIGHT = 162;

/** Hauteur minimale du corps texte sous l’image (alignement Agenda / Spots / Outils / Favoris). */
export const CATALOG_CARD_BODY_MIN_HEIGHT = 98;

/** Hauteur carte « À la une » dépliée (image + pastilles). */
export const HERO_EXPANDED_HEIGHT = 250;

/** Hauteur bande « À la une » repliée (sticky). */
export const HERO_COMPACT_HEIGHT = 54;

/** Hauteur image du carousel « À la une ». */
export const HERO_HEIGHT = 228;

/** Distance de scroll pour déclencher le repli animé du carousel. */
export const HERO_COLLAPSE_SCROLL = 100;

/** Marge anti-rebond (dépliage). */
export const HERO_EXPAND_SCROLL = 40;

/** Hauteur estimée de la tab bar (scroll minimum sur écrans onglets). */
export const TAB_BAR_ESTIMATE = 72;

/** Marge supplémentaire pour garantir le scroll / pull-to-refresh avec peu de contenu. */
export const SCROLL_OVERFLOW_BUFFER = 16;
