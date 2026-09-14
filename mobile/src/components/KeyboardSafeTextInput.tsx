import { forwardRef, useCallback } from 'react';
import { TextInput, type TextInputProps, type TextInput as TextInputType } from 'react-native';
import { useFormKeyboardEnsureVisible } from '@/components/KeyboardAwareFormScroll';
import { getActiveKeyboardScrollEnsure } from '@/lib/keyboard-scroll-registry';

/**
 * TextInput qui remonte le champ au-dessus du clavier (tous rôles / écrans).
 * Drop-in de remplacement de TextInput.
 */
export const KeyboardSafeTextInput = forwardRef<TextInputType, TextInputProps>(
  function KeyboardSafeTextInput({ onFocus, ...rest }, ref) {
    const ensureFromContext = useFormKeyboardEnsureVisible();

    const ensureVisible = useCallback(
      (bottomY: number) => {
        const fromRegistry = getActiveKeyboardScrollEnsure();
        if (fromRegistry) {
          fromRegistry(bottomY);
          return;
        }
        ensureFromContext(bottomY);
      },
      [ensureFromContext],
    );

    return (
      <TextInput
        ref={ref}
        {...rest}
        onFocus={(event) => {
          onFocus?.(event);
          const target = event.target as unknown as {
            measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
          };
          requestAnimationFrame(() => {
            setTimeout(() => {
              target.measureInWindow?.((_x, y, _w, h) => {
                ensureVisible(y + h + 12);
              });
            }, 60);
          });
        }}
      />
    );
  },
);
