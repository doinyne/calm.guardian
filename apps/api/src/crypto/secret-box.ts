import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** A named 256-bit key. The name travels with each sealed value, so keys can be rotated. */
export type EncryptionKey = { id: string; key: Buffer };

export type SecretBox = {
  /** Encrypts `plaintext`, bound to `context` (e.g. the table and row it's stored in). */
  seal: (plaintext: string, context: string) => string;
  /** Decrypts a sealed value. Throws `SecretBoxError` if it was tampered with or moved. */
  open: (sealed: string, context: string) => string;
};

/** The value can't be opened. The message never contains the value or the plaintext. */
export class SecretBoxError extends Error {
  override name = 'SecretBoxError';
}

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const FORMAT_VERSION = 'v1';

/**
 * Authenticated encryption for secrets we must store, like connected accounts' OAuth tokens
 * (product rule 4). AES-256-GCM with a random IV per value.
 *
 * The `context` is authenticated but not stored. Sealing a session with its table and row key means a
 * value copied onto another row won't open.
 *
 * The first key seals; every key opens. To rotate, put a new key first and keep the old one until
 * every value has been re-sealed.
 *
 * Sealed format: `v1.<keyId>.<iv>.<ciphertext>.<tag>`, base64url parts.
 */
export function createSecretBox(keys: readonly EncryptionKey[]): SecretBox {
  const [sealingKey] = keys;
  if (!sealingKey) throw new Error('A secret box needs at least one key');
  for (const { id, key } of keys) {
    if (key.length !== KEY_BYTES) throw new Error(`Encryption key "${id}" must be 32 bytes`);
  }
  const keysById = new Map(keys.map(({ id, key }) => [id, key]));

  return {
    seal(plaintext, context) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, sealingKey.key, iv).setAAD(Buffer.from(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const parts = [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString('base64url'));
      return [FORMAT_VERSION, sealingKey.id, ...parts].join('.');
    },

    open(sealed, context) {
      const [version, keyId = '', iv, ciphertext, tag, ...extra] = sealed.split('.');
      if (version !== FORMAT_VERSION || !iv || !ciphertext || !tag || extra.length > 0) {
        throw new SecretBoxError('Not a sealed value');
      }
      const key = keysById.get(keyId);
      if (!key) throw new SecretBoxError(`No key "${keyId}" to open this value`);

      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'))
          .setAAD(Buffer.from(context))
          .setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch (error) {
        throw new SecretBoxError('The value was tampered with or belongs to another record', {
          cause: error,
        });
      }
    },
  };
}
