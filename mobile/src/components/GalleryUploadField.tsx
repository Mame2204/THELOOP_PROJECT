import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { pickAndUploadContentImage } from '@/lib/media-upload-store';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  label: string;
  values: string[];
  onChange: (urls: string[]) => void;
  shell: ShellTheme;
  max?: number;
}

export function GalleryUploadField({ label, values, onChange, shell, max = 8 }: Props) {
  const [uploading, setUploading] = useState(false);

  async function handleAdd() {
    if (values.length >= max) {
      Alert.alert('Limite atteinte', `Maximum ${max} photos.`);
      return;
    }
    setUploading(true);
    try {
      const url = await pickAndUploadContentImage('gallery', {
        aspect: [1, 1],
        allowsEditing: true,
      });
      if (!url) return;
      onChange([...values, url]);
      if (!isSupabaseConfigured()) {
        Alert.alert(
          'Aperçu local',
          'Image visible sur cet appareil uniquement tant que Supabase Storage n\'est pas branché.',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec du téléversement.';
      Alert.alert('Galerie', message);
    } finally {
      setUploading(false);
    }
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>
      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        {values.length}/{max} photo(s) — la première sert aussi de couverture si aucune image dédiée.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {values.map((uri, index) => (
          <View key={`${uri}-${index}`} style={[styles.thumb, { borderColor: shell.filterInactiveBorder }]}>
            <RemoteImage uri={uri} style={styles.thumbImg} resizeMode="cover" />
            <Pressable style={styles.thumbRemove} onPress={() => removeAt(index)}>
              <Text style={styles.thumbRemoveText}>×</Text>
            </Pressable>
          </View>
        ))}

        {values.length < max ? (
          <Pressable
            style={[styles.addBtn, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
            onPress={() => void handleAdd()}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={shell.pageTitle} />
            ) : (
              <>
                <Text style={{ color: shell.pageTitle, fontSize: 22, fontWeight: '300' }}>+</Text>
                <Text style={{ color: shell.pageKicker, fontSize: 10, marginTop: 4 }}>Ajouter</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  hint: { fontSize: 11, marginBottom: 8, lineHeight: 16 },
  row: { gap: 8, paddingBottom: 4 },
  thumb: { width: 88, height: 88, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: { color: '#fff', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  addBtn: {
    width: 88,
    height: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
