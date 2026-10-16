import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import {
  pickImageFromLibrary,
  uploadContentImageWithPreview,
  uriForImagePreview,
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
 * Aperçu formulaire : Image Android en pixels fixes.
 * expo-image (pourcentage ou CoverImage) reste vide dans ce cadre, alors que
 * la même URL s'affiche sur la carte Agenda. On montre d'abord le JPEG local
 * qui vient d'être envoyé.
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
  const [columnWidth, setColumnWidth] = useState(0);
  const [picked, setPicked] = useState<{ url: string; previewUri: string } | null>(null);
  const [hideLocal, setHideLocal] = useState(false);

  const { width: windowWidth } = useWindowDimensions();
  const previewAspect = cropAspect[0] / cropAspect[1];
  const fallbackWidth = Math.max(240, Math.round(Math.min(Math.max(windowWidth, 320) - 32, 640)));
  const boxWidth = columnWidth > 0 ? columnWidth : fallbackWidth;
  const boxHeight = Math.max(1, Math.round(boxWidth / previewAspect));

  const remoteUrl = value.trim();
  const localUri = !hideLocal && picked?.url === remoteUrl ? picked.previewUri : null;
  const shownUri = localUri || remoteUrl;

  async function handlePick() {
    setUploading(true);
    setHideLocal(false);
    try {
      const rawUri = await pickImageFromLibrary({ aspect: cropAspect });
      if (!rawUri) return;

      const uploaded = await uploadContentImageWithPreview(rawUri, folder, { aspect: cropAspect });
      const previewUri = await uriForImagePreview(uploaded.previewUri);
      setPicked({ url: uploaded.url, previewUri });
      onChange(uploaded.url);

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

  function handleRemove() {
    setPicked(null);
    setHideLocal(false);
    onChange('');
  }

  const frameStyle = {
    width: boxWidth,
    height: boxHeight,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  };

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0) {
          setColumnWidth((current) => (current === next ? current : next));
        }
      }}
    >
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>

      {shownUri ? (
        <Image
          key={shownUri}
          source={{ uri: shownUri }}
          style={frameStyle}
          resizeMode="cover"
          resizeMethod="resize"
          fadeDuration={0}
          accessibilityLabel={label}
          onError={() => {
            if (localUri) setHideLocal(true);
          }}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            frameStyle,
            {
              borderColor: shell.filterInactiveBorder,
              backgroundColor: shell.filterInactiveBg,
            },
          ]}
        >
          {uploading ? (
            <ActivityIndicator color={shell.pageTitle} />
          ) : (
            <Text style={{ color: shell.pageKicker, fontSize: 12 }}>Aucune image sélectionnée</Text>
          )}
        </View>
      )}

      {uploading && shownUri ? (
        <ActivityIndicator style={styles.uploadingBelow} color={shell.pageTitle} />
      ) : null}

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
            {value ? "Changer l'image" : 'Choisir depuis la galerie'}
          </Text>
        )}
      </Pressable>

      {remoteUrl ? (
        <Pressable onPress={handleRemove} disabled={uploading}>
          <Text style={[styles.urlToggle, { color: shell.pageKicker }]}>Retirer l'image</Text>
        </Pressable>
      ) : null}

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
  wrap: { marginBottom: 10, alignSelf: 'stretch' },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  placeholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  uploadingBelow: { marginTop: 8 },
  pickBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 8,
  },
  hint: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  urlToggle: { fontSize: 11, fontWeight: '600', marginTop: 6, textDecorationLine: 'underline' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 6, fontSize: 14 },
});
