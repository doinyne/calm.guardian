import { parsePublicEnv } from './env';

const LOCAL = {
  appVariant: 'development',
  apiUrl: 'http://localhost:3000',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabasePublishableKey: 'sb_publishable_local',
};

const REMOTE = {
  ...LOCAL,
  apiUrl: 'https://api.example.com',
  supabaseUrl: 'https://project-ref.supabase.co',
};

describe('parsePublicEnv', () => {
  it('treats an unset variant as a local development build', () => {
    const env = parsePublicEnv({ ...LOCAL, appVariant: undefined });

    expect(env).toEqual({
      appVariant: 'development',
      apiUrl: 'http://localhost:3000',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'sb_publishable_local',
    });
  });

  it.each([
    ['apiUrl', 'EXPO_PUBLIC_API_URL'],
    ['supabaseUrl', 'EXPO_PUBLIC_SUPABASE_URL'],
    ['supabasePublishableKey', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  ])('rejects a missing %s with a message naming %s', (field, variable) => {
    expect(() => parsePublicEnv({ ...LOCAL, [field]: undefined })).toThrow(variable);
  });

  it('rejects an unknown variant', () => {
    expect(() => parsePublicEnv({ ...REMOTE, appVariant: 'staging' })).toThrow(
      /EXPO_PUBLIC_APP_VARIANT/,
    );
  });

  it.each(['preview', 'production'])('requires https for every URL in %s builds', (appVariant) => {
    expect(() =>
      parsePublicEnv({ ...REMOTE, appVariant, apiUrl: 'http://api.example.com' }),
    ).toThrow(/EXPO_PUBLIC_API_URL.*https/);
    expect(() =>
      parsePublicEnv({ ...REMOTE, appVariant, supabaseUrl: 'http://project-ref.supabase.co' }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL.*https/);
  });

  it('accepts https in production builds', () => {
    const env = parsePublicEnv({ ...REMOTE, appVariant: 'production' });

    expect(env.appVariant).toBe('production');
  });

  it('refuses a Supabase secret key, which must never be built into the app', () => {
    const secret = 'sb_secret_should_never_ship';

    expect(() => parsePublicEnv({ ...LOCAL, supabasePublishableKey: secret })).toThrow(
      /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
    expect(() => parsePublicEnv({ ...LOCAL, supabasePublishableKey: secret })).not.toThrow(secret);
  });
});
