/**
 * Ratio envoyé à Storage.
 * La galerie ([1, 1]) s'affiche. Le recadrage 16:9 écrit un JPEG qu'Android
 * n'affiche pas : cadre gris dans le formulaire, bloc de couleur dans l'agenda.
 * La couverture part donc dans le même carré ; le cadre large rogne à l'affichage.
 */
export function aspectPreparedForUpload(aspect?: [number, number]): [number, number] {
  const requested = aspect ?? [1, 1];
  if (requested[0] > 0 && requested[1] > 0 && requested[0] === requested[1]) {
    return [requested[0], requested[1]];
  }
  return [1, 1];
}
