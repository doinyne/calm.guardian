import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from './config';

function errorThrownBy(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('Expected the action to throw an Error');
}

const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');

const REQUIRED_ENV = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  TOKEN_ENCRYPTION_KEYS: `k1:${KEY_A}`,
  BLUESKY_REDIRECT_URL: 'http://127.0.0.1:3000/connections/bluesky/callback',
  APP_CONNECT_RETURN_URL: 'calmguardian-dev://connect/bluesky',
};

describe('loadConfig', () => {
  it('uses defaults when optional variables are missing', () => {
    expect(loadConfig(REQUIRED_ENV)).toMatchObject({
      port: 3000,
      logLevel: 'info',
      sweepIntervalMs: 300_000,
    });
  });

  it('reads the port Cloud Run provides', () => {
    expect(loadConfig({ ...REQUIRED_ENV, PORT: '8080' }).port).toBe(8080);
  });

  it('derives the token issuer and signing keys URL from the Supabase URL', () => {
    const { supabase } = loadConfig({
      ...REQUIRED_ENV,
      SUPABASE_URL: 'https://project-ref.supabase.co/',
    });

    expect(supabase.authIssuer).toBe('https://project-ref.supabase.co/auth/v1');
    expect(supabase.jwksUrl.href).toBe(
      'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });

  it('allows plain http only for a Supabase running on this machine', () => {
    expect(() =>
      loadConfig({ ...REQUIRED_ENV, SUPABASE_URL: 'http://127.0.0.1:54321' }),
    ).not.toThrow();

    const error = errorThrownBy(() =>
      loadConfig({ ...REQUIRED_ENV, SUPABASE_URL: 'http://project-ref.supabase.co' }),
    );
    expect(error.message).toContain('SUPABASE_URL');
  });

  it('reads the encryption keys in order, newest first', () => {
    const { tokenEncryptionKeys } = loadConfig({
      ...REQUIRED_ENV,
      TOKEN_ENCRYPTION_KEYS: `k2:${KEY_B},k1:${KEY_A}`,
    });

    expect(tokenEncryptionKeys.map(({ id }) => id)).toEqual(['k2', 'k1']);
    expect(tokenEncryptionKeys[0]?.key.equals(Buffer.from(KEY_B, 'base64'))).toBe(true);
  });

  it.each([
    ['a key that is not 32 bytes', `k1:${Buffer.alloc(16).toString('base64')}`],
    ['a key with no name', KEY_A],
    ['the same name twice', `k1:${KEY_A},k1:${KEY_B}`],
  ])('rejects %s without echoing the keys', (_case, value) => {
    const error = errorThrownBy(() =>
      loadConfig({ ...REQUIRED_ENV, TOKEN_ENCRYPTION_KEYS: value }),
    );

    expect(error.message).toContain('TOKEN_ENCRYPTION_KEYS');
    expect(error.message).not.toContain(KEY_A);
  });

  it('requires a Postgres URL for the database', () => {
    const error = errorThrownBy(() =>
      loadConfig({ ...REQUIRED_ENV, DATABASE_URL: 'https://example.com' }),
    );

    expect(error.message).toContain('DATABASE_URL');
  });

  it('reads where Bluesky sends people back to, and where the API returns them to the app', () => {
    const { bluesky } = loadConfig(REQUIRED_ENV);

    expect(bluesky.client).toEqual({
      kind: 'development',
      redirectUrl: new URL('http://127.0.0.1:3000/connections/bluesky/callback'),
    });
    expect(bluesky.appReturnUrl.href).toBe('calmguardian-dev://connect/bluesky');
  });

  it.each([
    'https://api.calmguardian.app/connections/bluesky/callback',
    'http://localhost:3000/connections/bluesky/callback',
  ])(
    'accepts only a 127.0.0.1 Bluesky redirect while we use the development client, not %s',
    (redirect) => {
      const error = errorThrownBy(() =>
        loadConfig({ ...REQUIRED_ENV, BLUESKY_REDIRECT_URL: redirect }),
      );

      expect(error.message).toContain('BLUESKY_REDIRECT_URL');
    },
  );

  it('returns people to the app by its own link scheme, never a web page', () => {
    const error = errorThrownBy(() =>
      loadConfig({ ...REQUIRED_ENV, APP_CONNECT_RETURN_URL: 'https://evil.example/steal' }),
    );

    expect(error.message).toContain('APP_CONNECT_RETURN_URL');
  });

  it('fails fast when the Supabase settings are missing', () => {
    const error = errorThrownBy(() => loadConfig({}));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain('SUPABASE_URL');
    expect(error.message).toContain('SUPABASE_SECRET_KEY');
  });

  it('fails fast and names the variable when a value is invalid', () => {
    const error = errorThrownBy(() => loadConfig({ ...REQUIRED_ENV, PORT: 'not-a-port' }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain('PORT');
  });

  it('never echoes the invalid value, which could be a secret', () => {
    const secretLookingValue = 'sk_live_do_not_log_me';

    const error = errorThrownBy(() =>
      loadConfig({ ...REQUIRED_ENV, LOG_LEVEL: secretLookingValue }),
    );

    expect(error.message).toContain('LOG_LEVEL');
    expect(error.message).not.toContain(secretLookingValue);
  });

  it('reads the Sweep interval in seconds, and refuses one too short', () => {
    expect(loadConfig({ ...REQUIRED_ENV, SWEEP_INTERVAL_SECONDS: '30' }).sweepIntervalMs).toBe(
      30_000,
    );
    expect(() => loadConfig({ ...REQUIRED_ENV, SWEEP_INTERVAL_SECONDS: '1' })).toThrow(
      /SWEEP_INTERVAL_SECONDS/,
    );
  });

  it('makes Bluesky a public client at the API itself once deployed (https)', () => {
    const { bluesky } = loadConfig({
      ...REQUIRED_ENV,
      BLUESKY_REDIRECT_URL: undefined,
      PUBLIC_API_URL: 'https://calm-guardian-api-abc123-nw.a.run.app',
    });

    expect(bluesky.client).toEqual({
      kind: 'public',
      clientId: new URL('https://calm-guardian-api-abc123-nw.a.run.app/oauth/client-metadata.json'),
      redirectUrl: new URL(
        'https://calm-guardian-api-abc123-nw.a.run.app/connections/bluesky/callback',
      ),
    });
  });

  it('needs the development redirect when running locally', () => {
    expect(() => loadConfig({ ...REQUIRED_ENV, BLUESKY_REDIRECT_URL: undefined })).toThrow(
      /BLUESKY_REDIRECT_URL/,
    );
  });
});
