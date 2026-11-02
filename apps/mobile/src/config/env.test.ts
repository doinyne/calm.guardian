import { parsePublicEnv } from './env';

describe('parsePublicEnv', () => {
  it('treats an unset variant as a local development build', () => {
    const env = parsePublicEnv({ appVariant: undefined, apiUrl: 'http://localhost:3000' });

    expect(env).toEqual({ appVariant: 'development', apiUrl: 'http://localhost:3000' });
  });

  it('rejects a missing API URL with a message naming the variable', () => {
    expect(() => parsePublicEnv({ appVariant: 'development', apiUrl: undefined })).toThrow(
      /EXPO_PUBLIC_API_URL/,
    );
  });

  it('rejects an unknown variant', () => {
    expect(() =>
      parsePublicEnv({ appVariant: 'staging', apiUrl: 'https://api.example.com' }),
    ).toThrow(/EXPO_PUBLIC_APP_VARIANT/);
  });

  it.each(['preview', 'production'])('requires https in %s builds', (appVariant) => {
    expect(() => parsePublicEnv({ appVariant, apiUrl: 'http://api.example.com' })).toThrow(/https/);
  });

  it('accepts https in production builds', () => {
    const env = parsePublicEnv({ appVariant: 'production', apiUrl: 'https://api.example.com' });

    expect(env.appVariant).toBe('production');
  });
});
