import type { ConfigContext, ExpoConfig } from 'expo/config';

// Expo's config loader transpiles this file but can't load other project TypeScript, so the values
// it shares with the app are repeated here. app.config.test.ts fails if they drift.

/**
 * PERMANENT once a build has been uploaded to either store. Decide it before the first upload
 * (docs/release/accounts-setup.md).
 */
const PRODUCTION_BUNDLE_ID = 'app.calmguardian';
const APP_NAME = 'Calm Guardian';
const URL_SCHEME = 'calmguardian';

/** Matches THEME_COLORS.{light,dark}.background in packages/shared. */
export const SPLASH_BACKGROUND = { light: '#f8fafa', dark: '#0e1414' };

/**
 * Each variant gets its own ID, name and URL scheme, so all three can be installed side by side and
 * deep links open the right one. Keys match APP_VARIANTS in src/config/app-variant.ts.
 */
export const VARIANT_SUFFIXES = {
  development: { id: 'dev', name: ' (Dev)' },
  preview: { id: 'preview', name: ' (Preview)' },
  production: { id: '', name: '' },
};
type Variant = keyof typeof VARIANT_SUFFIXES;

// React Native core uses these "required reason" APIs; Apple rejects builds that don't declare them.
// Expo modules ship their own manifests, which prebuild merges in.
const REACT_NATIVE_REQUIRED_REASON_APIS = [
  { type: 'NSPrivacyAccessedAPICategoryFileTimestamp', reasons: ['C617.1'] },
  { type: 'NSPrivacyAccessedAPICategoryUserDefaults', reasons: ['CA92.1'] },
  { type: 'NSPrivacyAccessedAPICategorySystemBootTime', reasons: ['35F9.1'] },
];

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const suffix = VARIANT_SUFFIXES[readVariant(process.env.EXPO_PUBLIC_APP_VARIANT)];
  const bundleId = suffix.id ? `${PRODUCTION_BUNDLE_ID}.${suffix.id}` : PRODUCTION_BUNDLE_ID;

  return {
    ...config,
    name: APP_NAME + suffix.name,
    slug: 'calm-guardian',
    scheme: suffix.id ? `${URL_SCHEME}-${suffix.id}` : URL_SCHEME,
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    runtimeVersion: { policy: 'fingerprint' },

    ios: {
      bundleIdentifier: bundleId,
      supportsTablet: false,
      config: { usesNonExemptEncryption: false },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyAccessedAPITypes: REACT_NATIVE_REQUIRED_REASON_APIS.map(({ type, reasons }) => ({
          NSPrivacyAccessedAPIType: type,
          NSPrivacyAccessedAPITypeReasons: reasons,
        })),
      },
    },

    android: {
      package: bundleId,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: SPLASH_BACKGROUND.light,
      },
    },

    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: SPLASH_BACKGROUND.light,
          dark: { backgroundColor: SPLASH_BACKGROUND.dark },
        },
      ],
      // The session lives in the Keychain/Keystore. We don't use biometrics, so no Face ID prompt
      // text; Android backup rules stay on so tokens never reach a cloud backup.
      ['expo-secure-store', { faceIDPermission: false }],
    ],

    experiments: { typedRoutes: true },
  };
}

/** Unset means a local dev build. EAS build profiles always set it (eas.json). */
function readVariant(value: string | undefined): Variant {
  if (!value) return 'development';
  if (isVariant(value)) return value;
  throw new Error(
    `EXPO_PUBLIC_APP_VARIANT must be one of ${Object.keys(VARIANT_SUFFIXES).join(', ')}; got "${value}"`,
  );
}

function isVariant(value: string): value is Variant {
  return Object.hasOwn(VARIANT_SUFFIXES, value);
}
