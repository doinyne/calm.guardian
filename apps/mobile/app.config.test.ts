import { THEME_COLORS } from '@calm-guardian/shared';
import type { ConfigContext } from 'expo/config';

import { APP_VARIANTS } from '@/config/app-variant';

import appConfig, { SPLASH_BACKGROUND, VARIANT_SUFFIXES } from './app.config';

const context: ConfigContext = {
  config: {},
  projectRoot: __dirname,
  staticConfigPath: null,
  packageJsonPath: null,
};

function configFor(variant: string | undefined) {
  const previous = process.env.EXPO_PUBLIC_APP_VARIANT;
  process.env.EXPO_PUBLIC_APP_VARIANT = variant;
  try {
    return appConfig(context);
  } finally {
    process.env.EXPO_PUBLIC_APP_VARIANT = previous;
  }
}

describe('app.config', () => {
  it('has settings for exactly the variants the app knows about', () => {
    expect(Object.keys(VARIANT_SUFFIXES).sort()).toEqual([...APP_VARIANTS].sort());
  });

  it('uses the brand background colours for the splash screen', () => {
    expect(SPLASH_BACKGROUND).toEqual({
      light: THEME_COLORS.light.background,
      dark: THEME_COLORS.dark.background,
    });
  });

  it('uses the permanent production bundle ID only for production builds', () => {
    expect(configFor('production').ios?.bundleIdentifier).toBe('app.calmguardian');
    expect(configFor('preview').ios?.bundleIdentifier).toBe('app.calmguardian.preview');
    expect(configFor('development').android?.package).toBe('app.calmguardian.dev');
  });

  it('gives each variant its own deep link scheme', () => {
    const schemes = APP_VARIANTS.map((variant) => configFor(variant).scheme);

    expect(new Set(schemes).size).toBe(APP_VARIANTS.length);
  });

  it('declares no encryption beyond HTTPS, so App Store export compliance is automatic', () => {
    expect(configFor('production').ios?.config?.usesNonExemptEncryption).toBe(false);
  });

  it('rejects an unknown variant rather than building with the wrong bundle ID', () => {
    expect(() => configFor('staging')).toThrow(/EXPO_PUBLIC_APP_VARIANT/);
  });
});
