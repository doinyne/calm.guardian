import { createClient, isAuthApiError } from '@supabase/supabase-js';

import type { SupabaseConfig } from '../config';
import type { AuthAdmin } from './delete-account';

/** Supabase Auth's admin API, using the server-only secret key. */
export function createSupabaseAuthAdmin({
  url,
  secretKey,
}: Pick<SupabaseConfig, 'url' | 'secretKey'>): AuthAdmin {
  const supabase = createClient(url, secretKey, {
    // A server-side admin client has no user session to keep or refresh.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    deleteUser: async (accountId) => {
      const { error } = await supabase.auth.admin.deleteUser(accountId);
      if (error && !isUserNotFound(error)) {
        throw new Error('Supabase Auth could not delete the user', { cause: error });
      }
    },
  };
}

const isUserNotFound = (error: unknown) => isAuthApiError(error) && error.code === 'user_not_found';
