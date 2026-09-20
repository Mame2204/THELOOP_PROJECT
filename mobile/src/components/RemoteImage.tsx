import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { resolveRemoteImageCandidates } from '@/lib/resolve-image-url';

const DEFAULT_RENDER_WIDTH = 800;
const MAX_RENDER_WIDTH = 900;
// Au-delà, la miniature générée à l'envoi serait visiblement floue.
const THUMBNAIL_MAX_RENDER_WIDTH = 320;

interface RemoteImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  fallbackColor?: string;
  fallbackStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  renderWidth?: number;
  contentPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

function toContentFit(mode: ImageResizeMode): 'cover' | 'contain' | 'fill' | 'none' | 'scale-down' {
  if (mode === 'contain') return 'contain';
  if (mode === 'stretch') return 'fill';
  if (mode === 'center') return 'none';
  return 'cover';
}

function isLocalUri(uri: string): boolean {
  const lower = uri.toLowerCase();
  return (
    lower.startsWith('file://') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://') ||
    lower.startsWith('assets-library://')
  );
}

function clampRenderWidth(width: number | undefined): number {
  const w = width ?? DEFAULT_RENDER_WIDTH;
  return Math.max(160, Math.min(MAX_RENDER_WIDTH, Math.round(w)));
}

/**
 * Image distante — priorise le transform Supabase (width plafonnée) pour limiter l’egress.
 * Pas de probe Range GET.
 */
export function RemoteImage({
  uri,
  style,
  resizeMode = 'cover',
  fallbackColor = '#e5e7eb',
  fallbackStyle,
  accessibilityLabel,
  renderWidth,
  contentPosition = 'center',
}: RemoteImageProps) {
  const cappedWidth = clampRenderWidth(renderWidth);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [uri, cappedWidth]);

  const candidates = useMemo(() => {
    if (!uri) return [] as string[];
    if (isLocalUri(uri)) return [uri];
    // Free : pas d’Image Transformations → /render/ échoue puis double-fetch.
    // Activer seulement si EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM=true (plan payant).
    const transformEnabled =
      (process.env.EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM ?? '').trim().toLowerCase() === 'true';
    return resolveRemoteImageCandidates(uri, {
      allowHttpFallback: Platform.OS === 'android',
      useSupabaseRender: transformEnabled,
      renderWidth: cappedWidth,
      preferThumbnail: (renderWidth ?? DEFAULT_RENDER_WIDTH) <= THUMBNAIL_MAX_RENDER_WIDTH,
    });
  }, [uri, cappedWidth, renderWidth]);

  const displayUri = candidates[candidateIndex] ?? null;
  const flatStyle = StyleSheet.flatten(style) ?? {};

  if (!displayUri || failed) {
    return <View style={[style, styles.fallback, { backgroundColor: fallbackColor }, fallbackStyle]} />;
  }

  return (
    <Image
      key={displayUri}
      source={{ uri: displayUri }}
      style={[
        flatStyle.width == null && flatStyle.flex == null ? styles.fill : null,
        style,
      ]}
      contentFit={toContentFit(resizeMode)}
      contentPosition={contentPosition}
      cachePolicy="memory-disk"
      recyclingKey={displayUri}
      accessibilityLabel={accessibilityLabel}
      onError={() => {
        if (candidateIndex + 1 < candidates.length) {
          setCandidateIndex((index) => index + 1);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  fallback: { overflow: 'hidden' },
});
