export type AccountSession = { isSignedIn: boolean };

/**
 * Whether the user is signed in to their Calm Guardian Account. Supabase Auth arrives in M1
 * (ADR-0002); until then everyone is signed out, so the app shows the welcome flow.
 */
export function useAccountSession(): AccountSession {
  return { isSignedIn: false };
}
