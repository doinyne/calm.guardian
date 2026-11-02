import { z } from 'zod';

import { parseAppVariant, type AppVariant } from './app-variant';

export type PublicEnv = {
  appVariant: AppVariant;
  apiUrl: string;
};

type RawPublicEnv = {
  appVariant: string | undefined;
  apiUrl: string | undefined;
};

const ApiUrlSchema = z.url({ protocol: /^https?$/ });

/** Pure, so it can be tested without a build. Fails fast with a message naming the variable. */
export function parsePublicEnv(raw: RawPublicEnv): PublicEnv {
  const appVariant = parseAppVariant(raw.appVariant);

  const apiUrl = ApiUrlSchema.safeParse(raw.apiUrl);
  if (!apiUrl.success) {
    throw new Error('EXPO_PUBLIC_API_URL must be an http(s) URL. See apps/mobile/.env.example.');
  }
  if (appVariant !== 'development' && !apiUrl.data.startsWith('https://')) {
    throw new Error(`EXPO_PUBLIC_API_URL must use https in ${appVariant} builds.`);
  }

  return { appVariant, apiUrl: apiUrl.data };
}

/**
 * Expo compiles `process.env.EXPO_PUBLIC_*` into the bundle, but only when written out literally
 * like this. These values are public: never put a secret in one.
 */
export const publicEnv = parsePublicEnv({
  appVariant: process.env.EXPO_PUBLIC_APP_VARIANT,
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
});

/** Internal builds show connection details to help testers; store builds don't. */
export const showsDiagnostics = publicEnv.appVariant !== 'production';
