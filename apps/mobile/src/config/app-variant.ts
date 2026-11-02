/** Which build this is. Also imported by app.config.ts, so keep it free of React Native imports. */
export const APP_VARIANTS = ['development', 'preview', 'production'] as const;
export type AppVariant = (typeof APP_VARIANTS)[number];

/** Unset means a local dev build. EAS build profiles always set it explicitly (eas.json). */
export function parseAppVariant(value: string | undefined): AppVariant {
  if (value === undefined || value === '') return 'development';

  const variant = APP_VARIANTS.find((candidate) => candidate === value);
  if (!variant) {
    throw new Error(
      `EXPO_PUBLIC_APP_VARIANT must be one of ${APP_VARIANTS.join(', ')}; got "${value}"`,
    );
  }
  return variant;
}
