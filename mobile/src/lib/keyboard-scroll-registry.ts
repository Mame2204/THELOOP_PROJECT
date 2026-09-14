type EnsureVisibleFn = (inputBottomY: number) => void;

type Entry = {
  ensure: EnsureVisibleFn;
  /** Plus le z-index / profondeur est élevé, plus le scroll est prioritaire (modales). */
  priority: number;
};

const stack: Entry[] = [];

/** Enregistre un conteneur scroll clavier (KeyboardAwareFormScroll). */
export function registerKeyboardScrollEnsure(
  ensure: EnsureVisibleFn,
  priority = 0,
): () => void {
  const entry: Entry = { ensure, priority };
  stack.push(entry);
  stack.sort((a, b) => a.priority - b.priority);
  return () => {
    const idx = stack.indexOf(entry);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

/** Dernier conteneur actif (formulaire / modal visible). */
export function getActiveKeyboardScrollEnsure(): EnsureVisibleFn | null {
  if (!stack.length) return null;
  return stack[stack.length - 1]!.ensure;
}
