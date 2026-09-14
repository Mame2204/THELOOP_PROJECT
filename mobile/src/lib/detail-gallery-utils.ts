/** URLs galerie hors couverture (formulaire et persistance). */

export function eventGalleryExtras(
  coverImageUrl: string | null | undefined,
  galleryImages?: string[] | null,
): string[] {
  const cover = coverImageUrl?.trim() || '';
  return [...new Set((galleryImages ?? []).map((url) => url.trim()).filter(Boolean).filter((url) => url !== cover))];
}

/** Construit la liste unique d'images pour les fiches détail (cover + galerie). */
export function buildDetailGalleryImages(
  coverImageUrl: string | null | undefined,
  galleryImages?: string[] | null,
): string[] {
  const cover = coverImageUrl?.trim() || '';
  const extras = eventGalleryExtras(coverImageUrl, galleryImages);
  const ordered = cover ? [cover, ...extras] : extras;
  return [...new Set(ordered)];
}
