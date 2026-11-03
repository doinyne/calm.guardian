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

const REQUIRED_ENV = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};

describe('loadConfig', () => {
  it('uses defaults when optional variables are missing', () => {
    expect(loadConfig(REQUIRED_ENV)).toMatchObject({ port: 3000, logLevel: 'info' });
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
});
