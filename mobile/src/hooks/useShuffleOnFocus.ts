import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

function nextSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/**
 * Nouvelle graine à chaque entrée dans l’écran (changement d’onglet).
 * Le premier focus conserve la graine initiale pour éviter un double mélange au montage.
 */
export function useShuffleOnFocus(): number {
  const [seed, setSeed] = useState(nextSeed);
  const skipFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocus.current) {
        skipFirstFocus.current = false;
        return;
      }
      setSeed(nextSeed());
    }, []),
  );

  return seed;
}
