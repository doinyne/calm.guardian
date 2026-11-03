import {
  createChunkedSecureStorage,
  MAX_ITEM_BYTES,
  type KeyValueStore,
} from './chunked-secure-storage';

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

/** An in-memory Keychain that, like some iOS versions, rejects items over the size limit. */
class FakeKeychain implements KeyValueStore {
  readonly items = new Map<string, string>();

  getItemAsync(key: string) {
    return Promise.resolve(this.items.get(key) ?? null);
  }

  setItemAsync(key: string, value: string) {
    if (utf8Bytes(value) > MAX_ITEM_BYTES) {
      return Promise.reject(new Error(`Value for ${key} is too large`));
    }
    this.items.set(key, value);
    return Promise.resolve();
  }

  deleteItemAsync(key: string) {
    this.items.delete(key);
    return Promise.resolve();
  }
}

// A realistic session: JSON with long base64url tokens and a name that isn't ASCII.
const LARGE_SESSION = JSON.stringify({
  access_token: 'eyJ'.padEnd(2600, 'x'),
  refresh_token: 'r3fr3sh',
  user: { id: 'a1b2', email: 'zoë@example.com', user_metadata: { name: 'Zoë Ōkami 🌿' } },
});

function setUp() {
  const keychain = new FakeKeychain();
  return { keychain, storage: createChunkedSecureStorage(keychain) };
}

describe('chunked secure storage', () => {
  it('returns null when nothing is stored', async () => {
    const { storage } = setUp();

    await expect(storage.getItem('session')).resolves.toBeNull();
  });

  it('returns a small value as it was stored', async () => {
    const { storage } = setUp();

    await storage.setItem('session', '{"refresh_token":"abc"}');

    await expect(storage.getItem('session')).resolves.toBe('{"refresh_token":"abc"}');
  });

  it('splits a value too large for one Keychain item, and joins it back exactly', async () => {
    const { storage, keychain } = setUp();

    await storage.setItem('session', LARGE_SESSION);

    await expect(storage.getItem('session')).resolves.toBe(LARGE_SESSION);
    expect(keychain.items.size).toBeGreaterThan(2);
  });

  it('measures pieces in bytes, so text in any language stays under the limit', async () => {
    const { storage } = setUp();
    const multiByteText = 'Zoë 🌿 Ōkami '.repeat(400);

    await storage.setItem('session', multiByteText);

    await expect(storage.getItem('session')).resolves.toBe(multiByteText);
  });

  it('removes leftover pieces when a shorter value replaces a longer one', async () => {
    const { storage, keychain } = setUp();
    await storage.setItem('session', LARGE_SESSION);

    await storage.setItem('session', 'short');

    await expect(storage.getItem('session')).resolves.toBe('short');
    expect([...keychain.items.keys()].sort()).toEqual(['session.0', 'session.count']);
  });

  it('removes every piece', async () => {
    const { storage, keychain } = setUp();
    await storage.setItem('session', LARGE_SESSION);

    await storage.removeItem('session');

    await expect(storage.getItem('session')).resolves.toBeNull();
    expect(keychain.items.size).toBe(0);
  });

  it('keeps separate keys apart', async () => {
    const { storage } = setUp();

    await storage.setItem('session', 'one');
    await storage.setItem('session-user', 'two');

    await expect(storage.getItem('session')).resolves.toBe('one');
    await expect(storage.getItem('session-user')).resolves.toBe('two');
  });

  it('returns null rather than a partial value when a piece is missing', async () => {
    const { storage, keychain } = setUp();
    await storage.setItem('session', LARGE_SESSION);

    keychain.items.delete('session.1');

    await expect(storage.getItem('session')).resolves.toBeNull();
  });

  it('returns null when the piece count is unreadable', async () => {
    const { storage, keychain } = setUp();
    keychain.items.set('session.count', 'not-a-number');

    await expect(storage.getItem('session')).resolves.toBeNull();
  });
});
