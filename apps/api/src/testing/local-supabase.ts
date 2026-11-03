import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { loadConfig } from '../config';

/** Settings and an admin client for the local Supabase stack, for integration tests only. */
export function connectToLocalSupabase() {
  const { supabase: config, databaseUrl, tokenEncryptionKeys } = loadConfig(process.env);
  const admin = createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  /** Creates a confirmed user with a password, so a test can get a real access token. */
  async function createTestUser() {
    const email = `integration-${randomUUID()}@example.com`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return { id: data.user.id, email, password };
  }

  return { config, databaseUrl, tokenEncryptionKeys, admin, createTestUser };
}
