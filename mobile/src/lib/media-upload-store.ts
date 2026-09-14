import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image, Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type MediaFolder = 'events' | 'spots' | 'gallery';

const ASPECT_EPSILON = 0.03;

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

async function ensureReadableFileUri(localUri: string): Promise<string> {
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
 * Recadre au ratio cible.
 * Si l’image est trop haute (portrait → 16:9), ancre en **haut** pour ne pas couper les têtes
 * (l’éditeur iOS centre souvent et coupe le haut).
 */
export async function cropToAspect(
  localUri: string,
  aspect: [number, number],
  gravity: 'top' | 'center' = 'top',
): Promise<string> {
  const readableUri = await ensureReadableFileUri(localUri);
  let width = 0;
  let height = 0;
  try {
    const size = await getImageSize(readableUri);
    width = size.width;
    height = size.height;
  } catch {
    return compressImageForUpload(readableUri);
  }

  if (width < 2 || height < 2) {
    return compressImageForUpload(readableUri);
  }

  const targetRatio = aspect[0] / aspect[1];
  const currentRatio = width / height;

  let cropWidth = width;
  let cropHeight = height;
  let originX = 0;
  let originY = 0;

  if (Math.abs(currentRatio - targetRatio) <= ASPECT_EPSILON) {
    return compressImageForUpload(readableUri);
  }

  if (currentRatio > targetRatio) {
    // Trop large → couper les côtés (centré)
    cropWidth = Math.max(1, Math.round(height * targetRatio));
    originX = Math.max(0, Math.round((width - cropWidth) / 2));
  } else {
    // Trop haute → couper bas/haut ; ancrage haut pour préserver le sujet
    cropHeight = Math.max(1, Math.round(width / targetRatio));
    if (gravity === 'center') {
      originY = Math.max(0, Math.round((height - cropHeight) / 2));
    } else {
      originY = 0;
    }
  }

  // Sécurité bounds
  if (originX + cropWidth > width) cropWidth = width - originX;
  if (originY + cropHeight > height) cropHeight = height - originY;

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

  if (cropWidth > 1600) {
    actions.push({ resize: { width: 1600 } });
  }

  const result = await manipulateAsync(readableUri, actions, {
    compress: 0.86,
    format: SaveFormat.JPEG,
  });
  return normalizeLocalFileUri(result.uri);
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
      width > 1600 ? ([{ resize: { width: 1600 } }] as Parameters<typeof manipulateAsync>[1]) : [];

    const result = await manipulateAsync(readableUri, actions, {
      compress: 0.86,
      format: SaveFormat.JPEG,
    });
    return normalizeLocalFileUri(result.uri);
  } catch {
    const fallback = await manipulateAsync(readableUri, [], {
      compress: 0.86,
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
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

export async function pickImageFromLibrary(options?: {
  /** Ratio suggéré à l’éditeur natif (iOS surtout ; Android souvent libre). */
  aspect?: [number, number];
  /** Affiche l’éditeur de recadrage natif avant retour. */
  allowsEditing?: boolean;
}): Promise<string | null> {
  const allowed = await requestImageLibraryPermission();
  if (!allowed) return null;

  const allowsEditing = options?.allowsEditing !== false;
  const aspect = options?.aspect ?? ([16, 9] as [number, number]);

  // iOS : l’éditeur natif centre le cadre et coupe souvent le haut.
  // On laisse choisir la photo sans crop natif, puis on force 16:9 ancré en haut.
  // Android : l’éditeur natif fonctionne mieux → on le garde.
  const useNativeEditor = allowsEditing && Platform.OS === 'android';

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: useNativeEditor,
    aspect: useNativeEditor ? aspect : undefined,
    quality: 1,
  });

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;
  return asset.uri;
}

export async function uploadContentImage(
  localUri: string,
  folder: MediaFolder,
  options?: { aspect?: [number, number] },
): Promise<string> {
  const aspect = options?.aspect ?? ([16, 9] as [number, number]);
  // Force le ratio (surtout iOS) avec ancrage haut, puis compress.
  const preparedUri = await cropToAspect(localUri, aspect, 'top');

  if (!isSupabaseConfigured() || !supabase) {
    return preparedUri;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const owner = user?.id ?? 'anonymous';
  const path = `${folder}/${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const arrayBuffer = await readLocalImageAsArrayBuffer(preparedUri);
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

  const { data } = supabase.storage.from('content-media').getPublicUrl(path);
  return data.publicUrl;
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
