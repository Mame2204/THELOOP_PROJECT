import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import {
  cropToAspect,
  ensureReadableFileUri,
  normalizeLocalFileUri,
  pickImageFromLibrary,
  uploadContentImage,
  type MediaFolder,
} from '@/lib/media-upload-store';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  shell: ShellTheme;
  folder: MediaFolder;
  hint?: string;
  cropAspect?: [number, number];
}

function isLocalPreviewUri(uri: string): boolean {
  const lower = uri.toLowerCase();
  return (
    lower.startsWith('file://') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://') ||
    lower.startsWith('assets-library://') ||
    (lower.startsWith('/') && !lower.startsWith('//'))
  );
}

/**
 * Champ image admin.
 * Aperçu local = Image RN (file:// fiable sur Android) · distant = expo-image.
 * Après upload : on affiche l’URL https (previewUri effacé).
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  shell,
  folder,
  hint,
  cropAspect = [16, 9],
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const { width: windowWidth } = useWindowDimensions();
  const previewAspect = cropAspect[0] / cropAspect[1];
  const boxWidth = Math.round(Math.min(windowWidth - 48, windowWidth * 0.92));
  const boxHeight = Math.round(boxWidth / previewAspect);

  const shown = previewUri || value;
  const shownIsLocal = shown ? isLocalPreviewUri(shown) : false;

  useEffect(() => {
    if (!value) return;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      setPreviewUri(null);
    }
  }, [value]);

  async function handlePick() {
    setUploading(true);
    try {
      const rawUri = await pickImageFromLibrary({
        aspect: cropAspect,
        allowsEditing: true,
      });
      if (!rawUri) return;

      const cropped = await cropToAspect(rawUri, cropAspect, 'top');
      const preparedUri = await ensureReadableFileUri(normalizeLocalFileUri(cropped));
      setPreviewUri(preparedUri);

      const url = await uploadContentImage(preparedUri, folder, { aspect: cropAspect });
      onChange(url);
      setPreviewUri(null);

      if (!isSupabaseConfigured()) {
        Alert.alert(
          'Aperçu local',
          "Supabase n'est pas configuré : l'image est visible sur cet appareil uniquement.",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec du téléversement.';
      Alert.alert('Image', message);
    } finally {
      setUploading(false);
    }
  }

  function renderPreview() {
    if (!shown) return null;

    if (shownIsLocal) {
      return (
        <RNImage
          key={shown}
          source={{ uri: shown }}
          style={{ width: boxWidth, height: boxHeight }}
          resizeMode="cover"
        />
      );
    }

    return (
      <Image
        key={shown}
        source={{ uri: shown }}
        style={{ width: boxWidth, height: boxHeight }}
        contentFit="cover"
        contentPosition="top"
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={shown}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>

      {shown ? (
        <View style={[styles.previewWrap, { width: boxWidth, height: boxHeight }]}>
          {renderPreview()}
          <Pressable
            style={styles.removeBtn}
            onPress={() => {
              setPreviewUri(null);
              onChange('');
            }}
          >
            <Text style={styles.removeText}>Retirer</Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              borderColor: shell.filterInactiveBorder,
              backgroundColor: shell.filterInactiveBg,
              width: boxWidth,
              height: boxHeight,
            },
          ]}
        >
          <Text style={{ color: shell.pageKicker, fontSize: 12 }}>Aucune image sélectionnée</Text>
        </View>
      )}

      <Pressable
        style={[
          styles.pickBtn,
          { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg },
        ]}
        onPress={() => void handlePick()}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color={shell.pageTitle} />
        ) : (
          <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>
            {value ? "Changer l'image (recadrer)" : 'Choisir depuis la galerie'}
          </Text>
        )}
      </Pressable>

      {hint ? <Text style={[styles.hint, { color: shell.pageKicker }]}>{hint}</Text> : null}

      <Pressable onPress={() => setShowUrl((v) => !v)}>
        <Text style={[styles.urlToggle, { color: shell.pageKicker }]}>
          {showUrl ? "Masquer l'URL" : 'Ou coller une URL'}
        </Text>
      </Pressable>

      {showUrl ? (
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: shell.filterInactiveBg,
              borderColor: shell.filterInactiveBorder,
              color: shell.pageTitle,
            },
          ]}
          value={value}
          onChangeText={(t) => {
            setPreviewUri(null);
            onChange(t);
          }}
          placeholder="https://..."
          placeholderTextColor={shell.pageKicker}
          autoCapitalize="none"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  previewWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#111827',
    position: 'relative',
  },
  placeholder: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pickBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  removeBtn: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 2,
  },
  removeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hint: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  urlToggle: { fontSize: 11, fontWeight: '600', marginTop: 6, textDecorationLine: 'underline' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 6, fontSize: 14 },
});
