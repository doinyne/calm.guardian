import { z } from 'zod';

import { parseAppVariant, type AppVariant } from './app-variant';

export type PublicEnv = {
  appVariant: AppVariant;
  apiUrl: string;
  supabaseUrl: string;
  /** Public by design: it only lets the app ask Supabase Auth to sign someone in. */
  supabasePublishableKey: string;
};

type RawPublicEnv = Record<keyof PublicEnv, string | undefined>;

const HttpUrlSchema = z.url({ protocol: /^https?$/ });

// Matches today's `sb_secret_…` keys. A secret key in the bundle would give anyone admin access.
const SECRET_KEY_PREFIX = 'sb_secret_';

/** Pure, so it can be tested without a build. Fails fast with a message naming the variable. */
export function parsePublicEnv(raw: RawPublicEnv): PublicEnv {
  const appVariant = parseAppVariant(raw.appVariant);

  return {
    appVariant,
    apiUrl: parseServiceUrl('EXPO_PUBLIC_API_URL', raw.apiUrl, appVariant),
    supabaseUrl: parseServiceUrl('EXPO_PUBLIC_SUPABASE_URL', raw.supabaseUrl, appVariant),
    supabasePublishableKey: parsePublishableKey(raw.supabasePublishableKey),
  };
}

function parseServiceUrl(variable: string, value: string | undefined, appVariant: AppVariant) {
  const url = HttpUrlSchema.safeParse(value);
  if (!url.success) {
    throw new Error(`${variable} must be an http(s) URL. See apps/mobile/.env.example.`);
  }
  if (appVariant !== 'development' && !url.data.startsWith('https://')) {
    throw new Error(`${variable} must use https in ${appVariant} builds.`);
  }
  return url.data;
}

function parsePublishableKey(value: string | undefined) {
  if (!value) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing. See apps/mobile/.env.example.',
    );
  }
  if (value.startsWith(SECRET_KEY_PREFIX)) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a Supabase secret key. Use the publishable key.',
    );
  }
  return value;
}

/**
 * Expo compiles `process.env.EXPO_PUBLIC_*` into the bundle, but only when written out literally
 * like this. These values are public: never put a secret in one.
 */
export const publicEnv = parsePublicEnv({
  appVariant: process.env.EXPO_PUBLIC_APP_VARIANT,
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

/** Internal builds show connection details to help testers; store builds don't. */
export const showsDiagnostics = publicEnv.appVariant !== 'production';
