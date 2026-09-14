import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { colors } from '@/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_HERO_HEIGHT = 220;

interface DetailPhotoGalleryProps {
  images: string[];
  height?: number;
  heroStyle?: ViewStyle;
  overlay?: ReactNode;
}

/** Galerie détail — swipe horizontal sur le hero + miniatures (écrans détail uniquement). */
export function DetailPhotoGallery({
  images,
  height = DEFAULT_HERO_HEIGHT,
  heroStyle,
  overlay,
}: DetailPhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<string>>(null);
  const slideWidth = SCREEN_WIDTH - 40;

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
      setActiveIndex(Math.max(0, Math.min(index, images.length - 1)));
    },
    [images.length, slideWidth],
  );

  const scrollToIndex = useCallback(
    (index: number) => {
      setActiveIndex(index);
      listRef.current?.scrollToOffset({ offset: index * slideWidth, animated: true });
    },
    [slideWidth],
  );

  if (images.length === 0) return null;

  return (
    <View>
      <View style={[styles.hero, { height }, heroStyle]}>
        {images.length > 1 ? (
          <FlatList
            ref={listRef}
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, index) => `${uri}-${index}`}
            onMomentumScrollEnd={onMomentumScrollEnd}
            getItemLayout={(_, index) => ({
              length: slideWidth,
              offset: slideWidth * index,
              index,
            })}
            renderItem={({ item }) => (
              <RemoteImage
                uri={item}
                style={{ width: slideWidth, height }}
                resizeMode="cover"
              />
            )}
          />
        ) : (
          <RemoteImage uri={images[0]} style={styles.singleImage} resizeMode="cover" />
        )}
        {overlay}
        {images.length > 1 ? (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {activeIndex + 1}/{images.length}
            </Text>
          </View>
        ) : null}
      </View>
      {images.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbs}>
          {images.map((url, index) => (
            <Pressable key={`${url}-${index}`} onPress={() => scrollToIndex(index)}>
              <RemoteImage
                uri={url}
                style={[styles.thumb, index === activeIndex && styles.thumbActive]}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 16, overflow: 'hidden' },
  singleImage: { width: '100%', height: '100%' },
  counter: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  counterText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  thumbs: { marginTop: 8 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 2,
    borderColor: colors.publicBorder,
    opacity: 0.85,
  },
  thumbActive: { borderColor: colors.black, opacity: 1 },
});
