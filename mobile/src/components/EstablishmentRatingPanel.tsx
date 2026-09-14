import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/** Visages 1 → 5 (du moins satisfait au plus satisfait). */
export const RATING_FACE_EMOJIS = ['😞', '😕', '😐', '🙂', '😍'] as const;

const FAB_SIZE = 44;
const EDGE = 12;
const DRAG_THRESHOLD = 10;
const PICKER_WIDTH = 178;
const PICKER_HEIGHT = 40;

interface EstablishmentRatingPanelProps {
  userRating?: number | null;
  disabled?: boolean;
  onRate?: (rating: number) => void;
  onAuthRequired?: () => void;
  shell: {
    pageTitle: string;
    pageKicker: string;
    filterInactiveBg: string;
    filterInactiveBorder: string;
  };
  accentColor?: string;
}

export function ratingToFaceEmoji(rating: number | null | undefined): string {
  if (rating == null || rating < 1 || rating > 5) return '🙂';
  return RATING_FACE_EMOJIS[rating - 1];
}

function defaultTopRightPosition() {
  const { width } = Dimensions.get('window');
  return {
    x: Math.max(EDGE, width - EDGE - 72),
    y: EDGE + 8,
  };
}

function clampFab(x: number, y: number, fabWidth: number) {
  const { width, height } = Dimensions.get('window');
  const maxX = Math.max(EDGE, width - EDGE - fabWidth);
  const maxY = Math.max(EDGE, height - EDGE - FAB_SIZE - 72);
  return {
    x: Math.min(maxX, Math.max(EDGE, x)),
    y: Math.min(maxY, Math.max(EDGE, y)),
  };
}

/** Place le sélecteur autour du FAB sans sortir de l’écran. */
function pickerOffset(fabX: number, fabY: number, fabWidth: number) {
  const { width, height } = Dimensions.get('window');
  const spaceBelow = height - (fabY + FAB_SIZE) - EDGE - 72;
  const placeBelow = spaceBelow >= PICKER_HEIGHT + 8;

  let left = 0;
  const preferredLeft = fabWidth - PICKER_WIDTH;
  const absLeft = fabX + preferredLeft;
  if (absLeft < EDGE) {
    left = EDGE - fabX;
  } else if (fabX + preferredLeft + PICKER_WIDTH > width - EDGE) {
    left = width - EDGE - PICKER_WIDTH - fabX;
  } else {
    left = preferredLeft;
  }

  return {
    left,
    top: placeBelow ? FAB_SIZE + 8 : -(PICKER_HEIGHT + 8),
  };
}

export function EstablishmentRatingPanel({
  userRating = null,
  disabled = false,
  onRate,
  onAuthRequired,
  shell: _shell,
  accentColor = '#C9A84C',
}: EstablishmentRatingPanelProps) {
  void _shell;
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState(defaultTopRightPosition);
  const [dragging, setDragging] = useState(false);

  const positionRef = useRef(position);
  const dragOrigin = useRef(position);
  const draggingRef = useRef(false);
  const fabWidthRef = useRef(72);
  const disabledRef = useRef(disabled);
  const onAuthRequiredRef = useRef(onAuthRequired);

  positionRef.current = position;
  disabledRef.current = disabled;
  onAuthRequiredRef.current = onAuthRequired;

  const hasRating = userRating != null;
  const fabWidth = hasRating ? FAB_SIZE : 72;

  const togglePicker = () => {
    if (disabled) return;
    if (onAuthRequired) {
      onAuthRequired();
      return;
    }
    setExpanded((prev) => !prev);
  };

  const handleRate = (value: number) => {
    if (disabled) return;
    onRate?.(value);
    setExpanded(false);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Ne capture pas le tap : laisse Pressable gérer le clic
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !disabledRef.current
          && (Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !disabledRef.current
          && (Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD),
        onPanResponderGrant: () => {
          dragOrigin.current = positionRef.current;
          draggingRef.current = true;
          setDragging(true);
          setExpanded(false);
        },
        onPanResponderMove: (_, gesture) => {
          if (!draggingRef.current) return;
          const next = clampFab(
            dragOrigin.current.x + gesture.dx,
            dragOrigin.current.y + gesture.dy,
            fabWidthRef.current,
          );
          setPosition(next);
        },
        onPanResponderRelease: () => {
          draggingRef.current = false;
          setDragging(false);
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
          setDragging(false);
        },
      }),
    [],
  );

  const pickerPos = pickerOffset(position.x, position.y, fabWidth);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.anchor, { left: position.x, top: position.y }]}
      onLayout={(e) => {
        fabWidthRef.current = Math.max(e.nativeEvent.layout.width, FAB_SIZE);
      }}
      {...panResponder.panHandlers}
    >
      <Pressable
        onPress={togglePicker}
        disabled={disabled || dragging}
        style={[
          styles.fab,
          hasRating ? styles.fabEmojiOnly : null,
          {
            backgroundColor: '#ffffff',
            borderColor: accentColor,
            opacity: dragging ? 0.9 : 1,
            shadowColor: '#000',
          },
        ]}
        accessibilityLabel={hasRating ? 'Modifier mon avis' : 'Donner mon avis'}
      >
        {hasRating ? (
          <Text style={styles.fabEmoji}>{ratingToFaceEmoji(userRating)}</Text>
        ) : (
          <Text style={[styles.fabLabel, { color: '#111827' }]}>Avis</Text>
        )}
      </Pressable>

      {expanded && !dragging ? (
        <View
          style={[
            styles.picker,
            {
              left: pickerPos.left,
              top: pickerPos.top,
              backgroundColor: '#ffffff',
              borderColor: '#e5e7eb',
            },
          ]}
        >
          {RATING_FACE_EMOJIS.map((emoji, index) => {
            const value = index + 1;
            const selected = userRating === value;
            return (
              <Pressable
                key={value}
                style={[
                  styles.faceBtn,
                  selected && { borderColor: accentColor, backgroundColor: accentColor + '22' },
                ]}
                disabled={disabled}
                onPress={() => handleRate(value)}
                accessibilityLabel={`Avis ${value} sur 5`}
              >
                <Text style={styles.faceEmoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    zIndex: 30,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 40,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabEmojiOnly: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  fabEmoji: { fontSize: 20, lineHeight: 24 },
  fabLabel: { fontSize: 13, fontWeight: '800', color: '#1A1A1A' },
  picker: {
    position: 'absolute',
    width: PICKER_WIDTH,
    height: PICKER_HEIGHT,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  faceBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceEmoji: { fontSize: 18 },
});
