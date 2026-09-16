import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import {
  listHomePartnerLogos,
  type HomePartnerLogo,
} from '@/lib/home-partners-store';
import { subscribeHomeRefresh } from '@/lib/home-refresh';
import { useContent } from '@/context/ContentContext';

const LOGOS_PER_ROW = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PADDING = 24;
const GAP = 6;
const GRID_WIDTH = SCREEN_WIDTH - H_PADDING * 2 - 24;
const CELL_SIZE = Math.floor((GRID_WIDTH - GAP * (LOGOS_PER_ROW - 1)) / LOGOS_PER_ROW);

interface PartnersLogoStripProps {
  accent: string;
  text: string;
  muted: string;
  surface: string;
  border: string;
}

/** Ruban logos partenaires — 10 par ligne, logos contenus et légèrement agrandis. */
export function PartnersLogoStrip({
  accent,
  text,
  muted,
  surface,
  border,
}: PartnersLogoStripProps) {
  const { activeCountryCode } = useContent();
  const [partners, setPartners] = useState<HomePartnerLogo[]>([]);
  const [loading, setLoading] = useState(true);

  const rows = useMemo(() => {
    const list = Array.isArray(partners) ? partners : [];
    const chunks: HomePartnerLogo[][] = [];
    for (let i = 0; i < list.length; i += LOGOS_PER_ROW) {
      chunks.push(list.slice(i, i + LOGOS_PER_ROW));
    }
    return chunks;
  }, [partners]);

  const loadPartners = useCallback(
    (force = false) => {
      setLoading(true);
      void listHomePartnerLogos(activeCountryCode, { force }).then((list) => {
        setPartners(Array.isArray(list) ? list : []);
        setLoading(false);
      });
    },
    [activeCountryCode],
  );

  useEffect(() => {
    let cancelled = false;
    setPartners([]);
    setLoading(true);
    void listHomePartnerLogos(activeCountryCode).then((list) => {
      if (!cancelled) {
        setPartners(Array.isArray(list) ? list : []);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeCountryCode]);

  useEffect(() => {
    return subscribeHomeRefresh((reason) => {
      // Pas de reload sur chaque home-refresh (featured, sections…) — logos peu volatils.
      if (
        reason === 'accueil-blocks' ||
        (reason.startsWith('admin-accueil') && reason.includes('partner'))
      ) {
        loadPartners(true);
      }
    });
  }, [loadPartners]);

  if (loading) {
    return (
      <View style={[styles.shell, { backgroundColor: surface, borderColor: border }]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  if (!Array.isArray(partners) || partners.length === 0) {
    return null;
  }

  return (
    <View style={[styles.shell, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.kicker, { color: accent }]}>Partenaires</Text>
      <Text style={[styles.title, { color: text }]}>Nos partenaires</Text>
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((item, index) => (
              <View
                key={`${item.id}-${index}`}
                style={[styles.logoCard, { borderColor: border, width: CELL_SIZE, height: CELL_SIZE }]}
                accessibilityLabel={item.name}
              >
                <RemoteImage
                  uri={item.logoUrl}
                  style={{ width: CELL_SIZE - 10, height: CELL_SIZE - 10 }}
                  resizeMode="contain"
                  renderWidth={256}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  kicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 2,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '800',
  },
  grid: { gap: GAP },
  row: { flexDirection: 'row', gap: GAP, justifyContent: 'flex-start' },
  logoCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
});
