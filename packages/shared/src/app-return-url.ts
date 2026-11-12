/**
 * Where the API may send someone back into the app after Bluesky: Expo Go's links (the demo runs in
 * Expo Go, ADR-0017) and the app's own schemes. Never a web address: the single-use code in the link
 * must only ever reach the app.
 */
export const APP_RETURN_SCHEMES = [
  'exp:',
  'exps:',
  'calmguardian:',
  'calmguardian-dev:',
  'calmguardian-preview:',
] as const;

/** A link's scheme, e.g. "exp:". Read by hand: this package runs where `URL` may not be typed. */
const SCHEME = /^([a-z][a-z0-9+.-]*:)\/\//i;

export function isAppReturnUrl(value: string): boolean {
  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase();
  return scheme !== undefined && (APP_RETURN_SCHEMES as readonly string[]).includes(scheme);
}
