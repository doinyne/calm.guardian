import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** A named 256-bit key. The name travels with each sealed value, so keys can be rotated. */
export type EncryptionKey = { id: string; key: Buffer };

export type SecretBox = {
  /** Encrypts `plaintext`, bound to `context` (e.g. the table and row it's stored in). */
  seal: (plaintext: string, context: string) => string;
  /** Decrypts a sealed value. Throws `SecretBoxError` if it was tampered with or moved. */
  open: (sealed: string, context: string) => string;
  /** `seal` for files such as images, without the size cost of text encoding. */
  sealBytes: (plaintext: Uint8Array, context: string) => Buffer;
  openBytes: (sealed: Uint8Array, context: string) => Uint8Array;
};

/** The value can't be opened. The message never contains the value or the plaintext. */
export class SecretBoxError extends Error {
  override name = 'SecretBoxError';
}

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_VERSION = 'v1';
const BYTES_FORMAT_VERSION = 1;

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
 * Sealed format: `v1.<keyId>.<iv>.<ciphertext>.<tag>`, base64url parts. Sealed bytes:
 * `<version 1><keyId length><keyId><iv><tag><ciphertext>`.
 */
export function createSecretBox(keys: readonly EncryptionKey[]): SecretBox {
  const [newestKey] = keys;
  if (!newestKey) throw new Error('A secret box needs at least one key');
  const sealingKey: EncryptionKey = newestKey;
  for (const { id, key } of keys) {
    if (key.length !== KEY_BYTES) throw new Error(`Encryption key "${id}" must be 32 bytes`);
  }
  const keysById = new Map(keys.map(({ id, key }) => [id, key]));

  function encrypt(plaintext: Uint8Array, context: string) {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, sealingKey.key, iv).setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { keyId: sealingKey.id, iv, ciphertext, tag: cipher.getAuthTag() };
  }

  function decrypt(
    { keyId, iv, ciphertext, tag }: { keyId: string; iv: Buffer; ciphertext: Buffer; tag: Buffer },
    context: string,
  ) {
    const key = keysById.get(keyId);
    if (!key) throw new SecretBoxError(`No key "${keyId}" to open this value`);

    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv)
        .setAAD(Buffer.from(context))
        .setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (error) {
      throw new SecretBoxError('The value was tampered with or belongs to another record', {
        cause: error,
      });
    }
  }

  return {
    seal(plaintext, context) {
      const { keyId, iv, ciphertext, tag } = encrypt(Buffer.from(plaintext, 'utf8'), context);
      const parts = [iv, ciphertext, tag].map((part) => part.toString('base64url'));
      return [FORMAT_VERSION, keyId, ...parts].join('.');
    },

    open(sealed, context) {
      const [version, keyId = '', iv, ciphertext, tag, ...extra] = sealed.split('.');
      if (version !== FORMAT_VERSION || !iv || !ciphertext || !tag || extra.length > 0) {
        throw new SecretBoxError('Not a sealed value');
      }
      const [ivBytes, ciphertextBytes, tagBytes] = [iv, ciphertext, tag].map((part) =>
        Buffer.from(part, 'base64url'),
      ) as [Buffer, Buffer, Buffer];
      return decrypt(
        { keyId, iv: ivBytes, ciphertext: ciphertextBytes, tag: tagBytes },
        context,
      ).toString('utf8');
    },

    sealBytes(plaintext, context) {
      const { keyId, iv, ciphertext, tag } = encrypt(plaintext, context);
      const keyIdBytes = Buffer.from(keyId, 'utf8');
      return Buffer.concat([
        Buffer.from([BYTES_FORMAT_VERSION, keyIdBytes.length]),
        keyIdBytes,
        iv,
        tag,
        ciphertext,
      ]);
    },

    openBytes(sealed, context) {
      const bytes = Buffer.from(sealed);
      const keyIdLength = bytes[1] ?? 0;
      const ivStart = 2 + keyIdLength;
      const tagStart = ivStart + IV_BYTES;
      const ciphertextStart = tagStart + TAG_BYTES;
      if (bytes[0] !== BYTES_FORMAT_VERSION || bytes.length < ciphertextStart) {
        throw new SecretBoxError('Not sealed bytes');
      }
      return decrypt(
        {
          keyId: bytes.subarray(2, ivStart).toString('utf8'),
          iv: bytes.subarray(ivStart, tagStart),
          tag: bytes.subarray(tagStart, ciphertextStart),
          ciphertext: bytes.subarray(ciphertextStart),
        },
        context,
      );
    },
  };
}
