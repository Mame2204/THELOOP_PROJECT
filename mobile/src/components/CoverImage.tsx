import { StyleSheet, View } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';

interface CoverImageProps {
  uri: string | null | undefined;
  height: number;
  fallbackColor?: string;
  borderRadius?: number;
  renderWidth?: number;
  onDisplayLoad?: () => void;
  onDisplayError?: () => void;
}

export function CoverImage({
  uri,
  height,
  fallbackColor = '#374151',
  borderRadius = 0,
  renderWidth = 800,
  onDisplayLoad,
  onDisplayError,
}: CoverImageProps) {
  return (
    <View
      style={[
        styles.frame,
        {
          height,
          borderTopLeftRadius: borderRadius,
          borderTopRightRadius: borderRadius,
        },
      ]}
    >
      <RemoteImage
        uri={uri}
        style={styles.image}
        fallbackColor={fallbackColor}
        resizeMode="cover"
        renderWidth={renderWidth}
        onDisplayLoad={onDisplayLoad}
        onDisplayError={onDisplayError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
