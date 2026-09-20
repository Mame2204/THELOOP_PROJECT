/**
 * Polyfill Web Crypto pour Supabase Auth PKCE (Expo Go / React Native).
 * Doit être importé avant createClient.
 */
import 'react-native-get-random-values';
import * as ExpoCrypto from 'expo-crypto';

type SubtleLike = Pick<SubtleCrypto, 'digest'>;

function toUint8Array(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

const subtlePolyfill: SubtleLike = {
  async digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
    const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
    if (name !== 'SHA-256') {
      throw new Error(`Algorithme non supporté : ${name}`);
    }
    const bytes = toUint8Array(data);
    return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
  },
};

const cryptoRef = globalThis.crypto as Crypto | undefined;

if (!cryptoRef?.subtle?.digest) {
  const base = cryptoRef ?? ({} as Crypto);
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...base,
      getRandomValues: base.getRandomValues?.bind(base) ?? ((array: Uint8Array) => {
        for (let i = 0; i < array.length; i += 1) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      }),
      subtle: {
        ...(base.subtle ?? {}),
        ...subtlePolyfill,
      },
    },
    configurable: true,
  });
}
