import {
  createClient,
  isAuthRetryableFetchError,
  processLock,
  type AuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import {
  SignInError,
  type AccountAuth,
  type SignedInAccount,
  type SignInErrorKind,
} from './account-auth';
import { createChunkedSecureStorage, type KeyValueStore } from './chunked-secure-storage';

const SESSION_STORAGE_KEY = 'calm-guardian.session';

// Readable only while the phone is unlocked, and never restored onto another phone from a backup.
// Calm Mode and Sweep run on the server, so the app never needs the session while locked.
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const keychain: KeyValueStore = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS),
};

const SIGN_IN_ERROR_BY_CODE: Partial<Record<string, SignInErrorKind>> = {
  email_address_invalid: 'invalid-email',
  validation_failed: 'invalid-email',
  // Supabase reports a wrong code and an expired code the same way.
  otp_expired: 'invalid-code',
  over_email_send_rate_limit: 'rate-limited',
  over_request_rate_limit: 'rate-limited',
};

type SupabaseAccountAuthSettings = { url: string; publishableKey: string };

/** Supabase Auth behind our `AccountAuth` port. Supabase's types and errors stop here. */
export function createSupabaseAccountAuth({
  url,
  publishableKey,
}: SupabaseAccountAuthSettings): AccountAuth {
  const { auth } = createClient(url, publishableKey, {
    auth: {
      storage: createChunkedSecureStorage(keychain),
      storageKey: SESSION_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // React Native has no Web Locks API. This keeps session reads and refreshes in order.
      lock: processLock,
    },
  });

  refreshOnlyInForeground(auth);

  return {
    onSessionChange: (listener) => {
      const { data } = auth.onAuthStateChange((_event, session) =>
        listener(toSignedInAccount(session)),
      );
      return () => data.subscription.unsubscribe();
    },

    sendSignInCode: async (email) => {
      const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw toSignInError(error);
    },

    verifySignInCode: async ({ email, code }) => {
      const { error } = await auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw toSignInError(error);
    },

    getAccessToken: async () => {
      const { data, error } = await auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    },

    signOutThisDevice: async () => {
      const { error } = await auth.signOut({ scope: 'local' });
      // By now Supabase has removed the session from this device; only telling the server failed.
      // That server-side session expires by itself, so signing out offline still signs you out.
      if (error && !isAuthRetryableFetchError(error)) throw error;
    },
  };
}

/** Supabase's React Native guidance: refresh tokens only while the app is on screen. */
function refreshOnlyInForeground(auth: SupabaseClient['auth']) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
}

function toSignedInAccount(session: Session | null): SignedInAccount | null {
  return session ? { id: session.user.id, email: session.user.email ?? null } : null;
}

function toSignInError(error: AuthError): SignInError {
  if (isAuthRetryableFetchError(error)) return new SignInError('network', { cause: error });
  return new SignInError(SIGN_IN_ERROR_BY_CODE[error.code ?? ''] ?? 'unknown', { cause: error });
}
