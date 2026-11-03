/** The parts of expo-secure-store this needs, so tests can use an in-memory Keychain. */
export type KeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

/** The storage interface supabase-js expects for its session. */
export type SessionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/** Some iOS versions have rejected Keychain items over about 2 KB. */
export const MAX_ITEM_BYTES = 2048;

/**
 * Keeps values of any size in the Keychain (iOS) or Keystore-backed storage (Android) by splitting
 * them into items under the size limit. A Supabase session is 2–4 KB.
 *
 * Pieces are written before the count, so an interrupted write is detected on the next read: a
 * missing or unreadable piece reads as "no value", which signs the user out rather than loading a
 * damaged session.
 */
export function createChunkedSecureStorage(store: KeyValueStore): SessionStorage {
  return {
    async getItem(key) {
      const count = parseCount(await store.getItemAsync(countKey(key)));
      if (count === null) return null;

      const pieces = await Promise.all(
        pieceIndexes(count).map((index) => store.getItemAsync(pieceKey(key, index))),
      );
      return pieces.every((piece) => piece !== null) ? pieces.join('') : null;
    },

    async setItem(key, value) {
      const previousCount = parseCount(await store.getItemAsync(countKey(key))) ?? 0;
      const pieces = splitByUtf8Bytes(value, MAX_ITEM_BYTES);

      for (const [index, piece] of pieces.entries()) {
        await store.setItemAsync(pieceKey(key, index), piece);
      }
      await store.setItemAsync(countKey(key), String(pieces.length));
      await deletePieces(store, key, { from: pieces.length, to: previousCount });
    },

    async removeItem(key) {
      const count = parseCount(await store.getItemAsync(countKey(key))) ?? 0;
      await deletePieces(store, key, { from: 0, to: count });
      await store.deleteItemAsync(countKey(key));
    },
  };
}

// Secure store keys may only contain letters, digits, ".", "-" and "_".
const countKey = (key: string) => `${key}.count`;
const pieceKey = (key: string, index: number) => `${key}.${index}`;

const pieceIndexes = (count: number) => Array.from({ length: count }, (_, index) => index);

function parseCount(stored: string | null): number | null {
  if (stored === null) return null;
  const count = Number(stored);
  return Number.isInteger(count) && count > 0 ? count : null;
}

async function deletePieces(
  store: KeyValueStore,
  key: string,
  { from, to }: { from: number; to: number },
) {
  for (let index = from; index < to; index += 1) {
    await store.deleteItemAsync(pieceKey(key, index));
  }
}

/** Splits on character boundaries so no piece ends halfway through a multi-byte character. */
function splitByUtf8Bytes(value: string, maxBytes: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  let pieceBytes = 0;

  for (const character of value) {
    const bytes = utf8Length(character);
    if (pieceBytes + bytes > maxBytes) {
      pieces.push(piece);
      piece = '';
      pieceBytes = 0;
    }
    piece += character;
    pieceBytes += bytes;
  }
  pieces.push(piece);

  return pieces;
}

function utf8Length(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}
