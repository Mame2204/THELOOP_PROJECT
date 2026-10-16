import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert, Image, InteractionManager, Platform } from 'react-native';
import { aspectPreparedForUpload } from '@/lib/media-upload-aspect';
import { markNetworkReachable } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type MediaFolder = 'events' | 'spots' | 'gallery';

const ASPECT_EPSILON = 0.03;

// Le plan Supabase ne donne pas accès aux Image Transformations : l'original
// stocké est servi tel quel à chaque affichage. La largeur couvre donc le plus
// grand besoin réel (galerie plein écran sur un écran 3x) sans aller au-delà.
const UPLOAD_MAX_WIDTH = 1280;
const UPLOAD_JPEG_QUALITY = 0.72;

// Miniature servie aux vignettes (bande de la galerie détail, logos du ruban).
// Sans elle, un carré de 64 points téléchargeait l'original de 1280 px.
const THUMBNAIL_WIDTH = 256;
const THUMBNAIL_JPEG_QUALITY = 0.6;
const THUMBNAIL_SUFFIX = '_thumb';

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Normalise toute URI locale (file / content / ph) vers un fichier cache lisible.
 * Sur Android, `content://` casse Image.getSize / manipulate → image noire.
 */
export function normalizeLocalFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('file://') || trimmed.startsWith('content://') || trimmed.startsWith('ph://')) {
    return trimmed;
  }
  // manipulateAsync peut renvoyer un chemin absolu sans schéma sur certains Android.
  if (trimmed.startsWith('/')) {
    return `file://${trimmed}`;
  }
  return trimmed;
}

export async function ensureReadableFileUri(localUri: string): Promise<string> {
  const normalized = normalizeLocalFileUri(localUri);
  if (normalized.startsWith('file://')) {
    return normalized;
  }

  const dest = `${LegacyFileSystem.cacheDirectory ?? ''}loop-upload-${Date.now()}.jpg`;

  try {
    await LegacyFileSystem.copyAsync({ from: normalized, to: dest });
    return normalizeLocalFileUri(dest);
  } catch {
    /* continue */
  }

  // Conversion JPEG via manipulate (lit souvent content:// / ph://)
  const converted = await manipulateAsync(normalized, [], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });
  return normalizeLocalFileUri(converted.uri);
}

/**
 * URI garantie pour l’aperçu (Image RN) — sur Android, copie systématique en cache .jpg
 * (les chemins renvoyés par manipulateAsync / content:// ne se peignent pas toujours en grand 16:9).
 */
export async function uriForImagePreview(localUri: string): Promise<string> {
  const readable = await ensureReadableFileUri(localUri);
  if (Platform.OS !== 'android') {
    return readable;
  }

  const dest = `${LegacyFileSystem.cacheDirectory ?? ''}loop-preview-${Date.now()}.jpg`;
  try {
    await LegacyFileSystem.copyAsync({ from: readable, to: dest });
    return normalizeLocalFileUri(dest);
  } catch {
    return readable;
  }
}

/** Lit une image locale en ArrayBuffer — compatible Expo 54 (iOS / Android). */
async function readLocalImageAsArrayBuffer(localUri: string): Promise<ArrayBuffer> {
  const readableUri = await ensureReadableFileUri(localUri);

  try {
    const response = await fetch(readableUri);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 0) return buffer;
    }
  } catch {
    /* fallback */
  }

  try {
    const file = new File(readableUri);
    const bytes = await file.bytes();
    if (bytes.byteLength > 0) return bytes.buffer as ArrayBuffer;
  } catch {
    /* fallback */
  }

  const base64 = await LegacyFileSystem.readAsStringAsync(readableUri, {
    encoding: 'base64',
  });
  if (!base64) {
    throw new Error('Impossible de lire l\'image sélectionnée.');
  }
  return decodeBase64ToArrayBuffer(base64);
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err ?? new Error('Impossible de lire les dimensions de l\'image.')),
    );
  });
}

/**
 * JPEG sans EXIF : Image.getSize et le crop doivent mesurer les mêmes pixels.
 * Sur Android, une photo portrait garde souvent width/height inversés tant que l’EXIF
 * n’est pas appliqué — le recadrage 16:9 sort alors du bitmap (fichier vide / cadre gris).
 * Le carré galerie tombe encore dans l’image, d’où l’écart couverture vs autres photos.
 */
async function bakeOrientationJpeg(localUri: string): Promise<string> {
  const result = await manipulateAsync(normalizeLocalFileUri(localUri), [], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });
  return normalizeLocalFileUri(result.uri);
}

/**
 * Recadre au ratio cible.
 * Si l’image est trop haute (portrait → 16:9), ancre en **haut** pour ne pas couper les têtes.
 */
export async function cropToAspect(
  localUri: string,
  aspect: [number, number],
  gravity: 'top' | 'center' = 'top',
): Promise<string> {
  const readableUri = await ensureReadableFileUri(localUri);
  let orientedUri = readableUri;
  try {
    orientedUri = await bakeOrientationJpeg(readableUri);
  } catch {
    orientedUri = readableUri;
  }

  let width = 0;
  let height = 0;
  try {
    const size = await getImageSize(orientedUri);
    width = size.width;
    height = size.height;
  } catch {
    return compressImageForUpload(orientedUri);
  }

  if (width < 2 || height < 2) {
    return compressImageForUpload(orientedUri);
  }

  const targetRatio = aspect[0] / aspect[1];
  const currentRatio = width / height;

  let cropWidth = width;
  let cropHeight = height;
  let originX = 0;
  let originY = 0;

  if (Math.abs(currentRatio - targetRatio) <= ASPECT_EPSILON) {
    return compressImageForUpload(orientedUri);
  }

  if (currentRatio > targetRatio) {
    cropWidth = Math.max(1, Math.round(height * targetRatio));
    originX = Math.max(0, Math.round((width - cropWidth) / 2));
  } else {
    cropHeight = Math.max(1, Math.round(width / targetRatio));
    if (gravity === 'center') {
      originY = Math.max(0, Math.round((height - cropHeight) / 2));
    } else {
      originY = 0;
    }
  }

  if (originX + cropWidth > width) cropWidth = width - originX;
  if (originY + cropHeight > height) cropHeight = height - originY;
  cropWidth = Math.max(1, Math.min(cropWidth, width));
  cropHeight = Math.max(1, Math.min(cropHeight, height));

  if (cropWidth < 2 || cropHeight < 2 || originX + cropWidth > width || originY + cropHeight > height) {
    return compressImageForUpload(orientedUri);
  }

  const actions: Parameters<typeof manipulateAsync>[1] = [
    {
      crop: {
        originX,
        originY,
        width: cropWidth,
        height: cropHeight,
      },
    },
  ];

  if (cropWidth > UPLOAD_MAX_WIDTH) {
    actions.push({ resize: { width: UPLOAD_MAX_WIDTH } });
  }

  try {
    const result = await manipulateAsync(orientedUri, actions, {
      compress: UPLOAD_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    const croppedUri = normalizeLocalFileUri(result.uri);
    if (!(await jpegHasPixels(croppedUri))) {
      return compressImageForUpload(orientedUri);
    }
    return croppedUri;
  } catch {
    return compressImageForUpload(orientedUri);
  }
}

/** Un JPEG de recadrage raté fait quelques centaines d’octets et ne s’affiche pas. */
async function jpegHasPixels(uri: string): Promise<boolean> {
  try {
    const info = await LegacyFileSystem.getInfoAsync(uri);
    if (!info.exists) return false;
    const size = 'size' in info && typeof info.size === 'number' ? info.size : 0;
    if (size > 0 && size < 1500) return false;
    const dims = await getImageSize(uri);
    return dims.width >= 8 && dims.height >= 8;
  } catch {
    return false;
  }
}

/**
 * Compresse / redimensionne sans recadrer — conserve toute la photo.
 */
export async function compressImageForUpload(localUri: string): Promise<string> {
  const readableUri = await ensureReadableFileUri(localUri);

  try {
    let width = 0;
    try {
      width = (await getImageSize(readableUri)).width;
    } catch {
      width = 0;
    }

    const actions =
      width > UPLOAD_MAX_WIDTH
        ? ([{ resize: { width: UPLOAD_MAX_WIDTH } }] as Parameters<typeof manipulateAsync>[1])
        : [];

    const result = await manipulateAsync(readableUri, actions, {
      compress: UPLOAD_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return normalizeLocalFileUri(result.uri);
  } catch {
    const fallback = await manipulateAsync(readableUri, [], {
      compress: UPLOAD_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return normalizeLocalFileUri(fallback.uri);
  }
}

/** @deprecated Préférer cropToAspect — conserve le nom pour les imports existants. */
export async function cropAndCompressToAspect(
  localUri: string,
  aspect: [number, number] = [16, 9],
): Promise<string> {
  return cropToAspect(localUri, aspect, 'top');
}

export async function requestImageLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain && Platform.OS === 'android') {
    Alert.alert(
      'Accès aux photos',
      'Autorisez l’accès aux photos dans Paramètres → THE LOOP pour choisir une image.',
    );
  }
  return false;
}

export async function pickImageFromLibrary(options?: {
  /** Ratio suggéré à l’éditeur natif (iOS surtout ; Android souvent libre). */
  aspect?: [number, number];
  /** Affiche l’éditeur de recadrage natif avant retour. */
  allowsEditing?: boolean;
}): Promise<string | null> {
  const allowed = await requestImageLibraryPermission();
  if (!allowed) return null;

  // Pas de recadrage natif (iOS ni Android) : évite IllegalStateException / crop launcher
  // non enregistré sur Android (Expo SDK 54) et mauvais cadrage iOS. Recadrage 16:9 en JS.
  void options;

  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const staleLauncher =
      Platform.OS === 'android' &&
      (msg.includes('IllegalStateException') || msg.includes('unregistered ActivityResultLauncher'));
    Alert.alert(
      'Galerie',
      staleLauncher
        ? 'Le sélecteur photo a été interrompu. Fermez THE LOOP complètement (pas seulement minimiser), rouvrez l’app, puis réessayez.'
        : 'Impossible d’ouvrir la galerie. Réessayez ou redémarrez l’application.',
    );
    return null;
  }

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;
  return asset.uri;
}

export type UploadedContentImage = {
  /** URL enregistrée (Storage, ou fichier local si Supabase est absent). */
  url: string;
  /** JPEG local déjà préparé — même octets que l'envoi. Sert d'aperçu si l'URL distante ne se peint pas. */
  previewUri: string;
};

/**
 * Prépare le JPEG (même carré que la galerie) et l'envoie.
 * `previewUri` reste le fichier local : le formulaire peut l'afficher sans réseau.
 */
export async function uploadContentImageWithPreview(
  localUri: string,
  folder: MediaFolder,
  options?: { aspect?: [number, number] },
): Promise<UploadedContentImage> {
  // Même préparation que la galerie (carré, ancré au centre). Un 16:9 ne s'affiche pas.
  const aspect = aspectPreparedForUpload(options?.aspect);
  const previewUri = await cropToAspect(localUri, aspect, 'center');

  if (!isSupabaseConfigured() || !supabase) {
    return { url: previewUri, previewUri };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const owner = user?.id ?? 'anonymous';
  const path = `${folder}/${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const arrayBuffer = await readLocalImageAsArrayBuffer(previewUri);
  if (!arrayBuffer.byteLength) {
    throw new Error('Image vide après compression — réessayez avec une autre photo.');
  }

  const { error } = await supabase.storage.from('content-media').upload(path, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  markNetworkReachable();
  await uploadThumbnail(previewUri, path);

  const { data } = supabase.storage.from('content-media').getPublicUrl(path);
  return { url: data.publicUrl, previewUri };
}

export async function uploadContentImage(
  localUri: string,
  folder: MediaFolder,
  options?: { aspect?: [number, number] },
): Promise<string> {
  const uploaded = await uploadContentImageWithPreview(localUri, folder, options);
  return uploaded.url;
}

/**
 * Dépose la miniature à côté de l'original, sous le même nom suffixé.
 * L'affichage la déduit de l'URL principale : aucune colonne à stocker.
 * Un échec n'est pas bloquant, l'affichage retombe alors sur l'original.
 */
async function uploadThumbnail(preparedUri: string, originalPath: string): Promise<void> {
  if (!supabase) return;

  try {
    const thumb = await manipulateAsync(preparedUri, [{ resize: { width: THUMBNAIL_WIDTH } }], {
      compress: THUMBNAIL_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    const buffer = await readLocalImageAsArrayBuffer(normalizeLocalFileUri(thumb.uri));
    if (!buffer.byteLength) return;

    const thumbPath = originalPath.replace(/\.jpg$/i, `${THUMBNAIL_SUFFIX}.jpg`);
    await supabase.storage.from('content-media').upload(thumbPath, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  } catch {
    /* non bloquant */
  }
}

export async function pickAndUploadContentImage(
  folder: MediaFolder,
  options?: {
    aspect?: [number, number];
    allowsEditing?: boolean;
  },
): Promise<string | null> {
  const localUri = await pickImageFromLibrary(options);
  if (!localUri) return null;
  return uploadContentImage(localUri, folder, { aspect: options?.aspect });
}
