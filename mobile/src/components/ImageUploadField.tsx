import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import {
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

/**
 * Même affichage que la galerie spot : URL Storage + RemoteImage (taille fixe).
 * Le recadrage 16:9 est fait dans uploadContentImage, après correction EXIF.
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

  const { width: windowWidth } = useWindowDimensions();
  const previewAspect = cropAspect[0] / cropAspect[1];
  const boxWidth = Math.max(240, Math.round(Math.min(Math.max(windowWidth, 320) - 48, 640)));
  const boxHeight = Math.round(boxWidth / previewAspect);
  const boxStyle = { width: boxWidth, height: boxHeight };

  const remoteUrl = value.trim();

  async function handlePick() {
    setUploading(true);
    try {
      const rawUri = await pickImageFromLibrary({ aspect: cropAspect });
      if (!rawUri) return;

      const url = await uploadContentImage(rawUri, folder, { aspect: cropAspect });
      onChange(url);

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

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>

      {remoteUrl || uploading ? (
        <View style={[styles.previewWrap, boxStyle]}>
          {remoteUrl ? (
            <RemoteImage
              uri={remoteUrl}
              style={boxStyle}
              resizeMode="cover"
              contentPosition="top"
              renderWidth={800}
              fallbackColor={shell.filterInactiveBg}
            />
          ) : (
            <View style={[styles.uploadingFill, { backgroundColor: shell.filterInactiveBg }]}>
              <ActivityIndicator color={shell.pageTitle} />
            </View>
          )}
          {uploading ? (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
          {remoteUrl ? (
            <Pressable
              style={styles.removeBtn}
              onPress={() => {
                onChange('');
              }}
            >
              <Text style={styles.removeText}>Retirer</Text>
            </Pressable>
          ) : null}
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
          onChangeText={onChange}
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
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  uploadingFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
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
