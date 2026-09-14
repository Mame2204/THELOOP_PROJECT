/** PRNG déterministe (mulberry32) — même graine = même suite. */
export function createSeededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates. Même `seed` + mêmes éléments (même ordre d’entrée) = même permutation. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const rand = createSeededRandom(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const current = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = current;
  }
  return arr;
}
