import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerKeyboardScrollEnsure } from '@/lib/keyboard-scroll-registry';

type EnsureVisibleFn = (inputBottomY: number) => void;

const FormKeyboardContext = createContext<EnsureVisibleFn | null>(null);

/** À appeler depuis onFocus d'un TextInput pour remonter le champ au-dessus du clavier. */
export function useFormKeyboardEnsureVisible(): EnsureVisibleFn {
  const ensure = useContext(FormKeyboardContext);
  return useCallback(
    (inputBottomY: number) => {
      ensure?.(inputBottomY);
    },
    [ensure],
  );
}

type Props = ScrollViewProps & {
  children?: ReactNode;
  /** Marge au-dessus du clavier (px). */
  extraKeyboardPadding?: number;
  /** Priorité registre (modales > écrans). */
  keyboardPriority?: number;
};

/**
 * ScrollView de formulaire : padding = hauteur clavier + scroll auto du champ focusé.
 */
export const KeyboardAwareFormScroll = forwardRef<ScrollView, Props>(
  function KeyboardAwareFormScroll(
    {
      children,
      style,
      contentContainerStyle,
      extraKeyboardPadding = 28,
      keyboardPriority = 0,
      onScroll,
      ...rest
    },
    ref,
  ) {
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView | null>(null);
    const scrollYRef = useRef(0);
    const keyboardHeightRef = useRef(0);
    const pendingBottomYRef = useRef<number | null>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    const setRefs = useCallback(
      (node: ScrollView | null) => {
        scrollRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const scrollInputBottomIntoView = useCallback(
      (inputBottomY: number, kbHeight: number) => {
        if (kbHeight <= 0) return;
        const windowHeight = Dimensions.get('window').height;
        const keyboardTop = windowHeight - kbHeight;
        const margin = extraKeyboardPadding;
        if (inputBottomY <= keyboardTop - margin) return;
        const delta = inputBottomY - (keyboardTop - margin);
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollYRef.current + delta),
          animated: true,
        });
      },
      [extraKeyboardPadding],
    );

    const ensureVisible = useCallback<EnsureVisibleFn>(
      (inputBottomY) => {
        pendingBottomYRef.current = inputBottomY;
        const kb = keyboardHeightRef.current;
        if (kb > 0) {
          scrollInputBottomIntoView(inputBottomY, kb);
          return;
        }
        setTimeout(() => {
          const latest = keyboardHeightRef.current;
          if (latest > 0 && pendingBottomYRef.current != null) {
            scrollInputBottomIntoView(pendingBottomYRef.current, latest);
          }
        }, 220);
      },
      [scrollInputBottomIntoView],
    );

    useEffect(() => registerKeyboardScrollEnsure(ensureVisible, keyboardPriority), [
      ensureVisible,
      keyboardPriority,
    ]);

    useEffect(() => {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

      const showSub = Keyboard.addListener(showEvent, (event) => {
        const next = event.endCoordinates.height;
        keyboardHeightRef.current = next;
        setKeyboardHeight(next);
        const pending = pendingBottomYRef.current;
        if (pending != null) {
          requestAnimationFrame(() => {
            setTimeout(() => scrollInputBottomIntoView(pending, next), Platform.OS === 'ios' ? 40 : 80);
          });
        }
      });
      const hideSub = Keyboard.addListener(hideEvent, () => {
        keyboardHeightRef.current = 0;
        pendingBottomYRef.current = null;
        setKeyboardHeight(0);
      });

      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, [scrollInputBottomIntoView]);

    const paddingBottom = useMemo(() => {
      const flat = StyleSheet.flatten(contentContainerStyle) ?? {};
      const base = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : 40;
      if (keyboardHeight <= 0) return base + 48;
      return base + Math.max(0, keyboardHeight - insets.bottom) + extraKeyboardPadding;
    }, [contentContainerStyle, extraKeyboardPadding, insets.bottom, keyboardHeight]);

    const handleScroll = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollYRef.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      },
      [onScroll],
    );

    return (
      <FormKeyboardContext.Provider value={ensureVisible}>
        <ScrollView
          ref={setRefs}
          // Ne pas forcer flex:1 — dans une modale (maxHeight seul), flex:1 → hauteur 0
          // et seuls les boutons hors scroll restent visibles.
          style={style}
          contentContainerStyle={[contentContainerStyle, { paddingBottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator
          onScroll={handleScroll}
          scrollEventThrottle={16}
          {...rest}
        >
          {children}
        </ScrollView>
      </FormKeyboardContext.Provider>
    );
  },
);

/** Enveloppe racine : décale le contenu quand le clavier s’ouvre (tous rôles). */
export function AppKeyboardRoot({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.flex}>{children}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
