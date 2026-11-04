import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createSecretBox, SecretBoxError, type EncryptionKey } from './secret-box';

const key = (id: string): EncryptionKey => ({ id, key: randomBytes(32) });

const SESSION = JSON.stringify({ refresh_token: 'refresh-token-value', dpopJwk: { d: 'private' } });
const CONTEXT = 'atproto_oauth_sessions:did:plc:abc123';

describe('secret box', () => {
  const k1 = key('k1');

  it('opens what it sealed', () => {
    const box = createSecretBox([k1]);

    expect(box.open(box.seal(SESSION, CONTEXT), CONTEXT)).toBe(SESSION);
  });

  it('never repeats a ciphertext, even for the same value', () => {
    const box = createSecretBox([k1]);

    expect(box.seal(SESSION, CONTEXT)).not.toBe(box.seal(SESSION, CONTEXT));
  });

  it('contains none of the plaintext', () => {
    const sealed = createSecretBox([k1]).seal(SESSION, CONTEXT);

    expect(sealed).not.toContain('refresh-token-value');
    expect(sealed).not.toContain('private');
  });

  it('refuses a value sealed for another row, so values cannot be swapped between rows', () => {
    const box = createSecretBox([k1]);
    const sealed = box.seal(SESSION, CONTEXT);

    expect(() => box.open(sealed, 'atproto_oauth_sessions:did:plc:someone-else')).toThrow(
      SecretBoxError,
    );
  });

  it('refuses a tampered value', () => {
    const box = createSecretBox([k1]);
    const sealed = box.seal(SESSION, CONTEXT);
    const parts = sealed.split('.');
    const ciphertext = parts[3] ?? '';
    parts[3] = (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1);

    expect(() => box.open(parts.join('.'), CONTEXT)).toThrow(SecretBoxError);
  });

  it('refuses a value sealed with a key it does not have', () => {
    const sealed = createSecretBox([key('old')]).seal(SESSION, CONTEXT);

    expect(() => createSecretBox([k1]).open(sealed, CONTEXT)).toThrow(SecretBoxError);
  });

  it('seals with the newest key but still opens values sealed with an older one', () => {
    const k2 = key('k2');
    const sealedBeforeRotation = createSecretBox([k1]).seal(SESSION, CONTEXT);
    const rotated = createSecretBox([k2, k1]);

    expect(rotated.open(sealedBeforeRotation, CONTEXT)).toBe(SESSION);
    expect(rotated.seal(SESSION, CONTEXT)).toMatch(/^v1\.k2\./);
  });

  it('refuses text that is not a sealed value, without echoing it', () => {
    const box = createSecretBox([k1]);

    expect(() => box.open('refresh-token-value', CONTEXT)).toThrow(SecretBoxError);
    expect(() => box.open('refresh-token-value', CONTEXT)).not.toThrow(/refresh-token-value/);
  });

  it('rejects a key that is not 256 bits, or no keys at all', () => {
    expect(() => createSecretBox([{ id: 'short', key: randomBytes(16) }])).toThrow(/32 bytes/);
    expect(() => createSecretBox([])).toThrow(/at least one key/);
  });
});

describe('secret box, for files', () => {
  const k1 = key('k1');
  const IMAGE = randomBytes(4096);
  const IMAGE_CONTEXT = 'archived_media:post-1:bafkreiimage';

  it('opens the bytes it sealed', () => {
    const box = createSecretBox([k1]);

    expect(Buffer.from(box.openBytes(box.sealBytes(IMAGE, IMAGE_CONTEXT), IMAGE_CONTEXT))).toEqual(
      IMAGE,
    );
  });

  it('never repeats a ciphertext, and hides the original bytes', () => {
    const box = createSecretBox([k1]);
    const sealed = box.sealBytes(IMAGE, IMAGE_CONTEXT);

    expect(sealed).not.toEqual(box.sealBytes(IMAGE, IMAGE_CONTEXT));
    expect(sealed.includes(IMAGE.subarray(0, 64))).toBe(false);
  });

  it('refuses bytes sealed for another post', () => {
    const box = createSecretBox([k1]);
    const sealed = box.sealBytes(IMAGE, IMAGE_CONTEXT);

    expect(() => box.openBytes(sealed, 'archived_media:post-2:bafkreiimage')).toThrow(
      SecretBoxError,
    );
  });

  it('refuses tampered bytes', () => {
    const box = createSecretBox([k1]);
    const sealed = Buffer.from(box.sealBytes(IMAGE, IMAGE_CONTEXT));
    sealed[sealed.length - 1] = (sealed.at(-1) ?? 0) ^ 0xff;

    expect(() => box.openBytes(sealed, IMAGE_CONTEXT)).toThrow(SecretBoxError);
  });

  it('opens bytes sealed with an older key after a rotation', () => {
    const k2 = key('k2');
    const sealed = createSecretBox([k1]).sealBytes(IMAGE, IMAGE_CONTEXT);

    expect(Buffer.from(createSecretBox([k2, k1]).openBytes(sealed, IMAGE_CONTEXT))).toEqual(IMAGE);
  });

  it('refuses bytes that were never sealed', () => {
    expect(() => createSecretBox([k1]).openBytes(IMAGE, IMAGE_CONTEXT)).toThrow(SecretBoxError);
  });
});
