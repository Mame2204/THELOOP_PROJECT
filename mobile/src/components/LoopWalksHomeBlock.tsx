import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { CatalogCoverScrim } from '@/components/DetailHeroScrim';
import {
  formatWalkMetaLine,
  type LoopWalk,
} from '@/lib/loop-walks-store';

interface LoopWalksHomeBlockProps {
  featured: LoopWalk | null;
  loading?: boolean;
  accent: string;
  text: string;
  muted: string;
  surface: string;
  border: string;
  onOpenWalk: (walk: LoopWalk) => void;
  onOpenList: () => void;
}

/** Bloc Accueil — parcours de la semaine (données fournies par l’écran parent). */
export function LoopWalksHomeBlock({
  featured,
  loading = false,
  accent,
  text,
  muted,
  surface,
  border,
  onOpenWalk,
  onOpenList,
}: LoopWalksHomeBlockProps) {
  if (loading && !featured) {
    return (
      <View style={[styles.shell, styles.loadingShell, { backgroundColor: surface, borderColor: border }]}>
        <Text style={[styles.kicker, { color: accent }]}>Parcours</Text>
        <Text style={[styles.loadingHint, { color: muted }]}>Chargement…</Text>
      </View>
    );
  }

  if (!featured) return null;

  return (
    <View style={[styles.shell, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: accent }]}>Parcours</Text>
          <Text style={[styles.headTitle, { color: text }]}>Parcours de la semaine</Text>
        </View>
        <Pressable onPress={onOpenList} hitSlop={8}>
          <Text style={[styles.allLink, { color: accent }]}>Tous</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => onOpenWalk(featured)}
        style={({ pressed }) => [styles.featured, { opacity: pressed ? 0.94 : 1 }]}
      >
        <RemoteImage uri={featured.coverImageUrl} style={styles.featuredImg} resizeMode="cover" renderWidth={800} />
        <CatalogCoverScrim />
        <View style={[styles.tag, { backgroundColor: accent }]}>
          <Text style={styles.tagText}>{featured.categoryLabel}</Text>
        </View>
        <View style={styles.featuredBody}>
          <Text style={styles.featuredTitle} numberOfLines={1}>
            {featured.title}
          </Text>
          <Text style={[styles.meta, { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
            {formatWalkMetaLine(featured)}
          </Text>
          {featured.summary ? (
            <Text style={styles.featuredSummary} numberOfLines={2} ellipsizeMode="tail">
              {featured.summary}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    overflow: 'hidden',
  },
  loadingShell: { minHeight: 88, justifyContent: 'center' },
  loadingHint: { marginTop: 6, fontSize: 12 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  kicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  headTitle: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '800',
  },
  allLink: { fontSize: 12, fontWeight: '800', marginTop: 4 },
  featured: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  featuredImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  tag: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: { color: '#0a0a0a', fontSize: 10, fontWeight: '800' },
  featuredBody: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  featuredTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 4,
  },
  featuredSummary: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    lineHeight: 16,
  },
  meta: { fontSize: 12, fontWeight: '600' },
});
