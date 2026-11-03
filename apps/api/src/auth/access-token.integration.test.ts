import { createClient } from '@supabase/supabase-js';
import { createRemoteJWKSet } from 'jose';
import { afterAll, describe, expect, it } from 'vitest';

import { connectToLocalSupabase } from '../testing/local-supabase';
import { AccessTokenRejectedError, createAccessTokenVerifier } from './access-token';

// Proves our assumptions about Supabase's tokens (issuer, audience, claims, signing keys) against
// the real thing, not just against tokens we sign ourselves.
describe('verifying real Supabase access tokens (local Supabase)', () => {
  const supabase = connectToLocalSupabase();
  const verify = createAccessTokenVerifier({
    keys: createRemoteJWKSet(supabase.config.jwksUrl),
    issuer: supabase.config.authIssuer,
  });
  const leftovers: string[] = [];

  afterAll(async () => {
    await Promise.all(leftovers.map((id) => supabase.admin.auth.admin.deleteUser(id)));
  });

  async function signIn() {
    const user = await supabase.createTestUser();
    leftovers.push(user.id);
    const client = createClient(supabase.config.url, supabase.config.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword(user);
    if (error) throw error;
    return { user, accessToken: data.session.access_token };
  }

  it('accepts a signed-in user and returns their Account ID', async () => {
    const { user, accessToken } = await signIn();

    await expect(verify(accessToken)).resolves.toEqual({ accountId: user.id });
  });

  it('rejects a tampered token', async () => {
    const { accessToken } = await signIn();
    const [header, payload] = accessToken.split('.');
    const tampered = `${header}.${payload}.${'A'.repeat(86)}`;

    await expect(verify(tampered)).rejects.toThrow(AccessTokenRejectedError);
  });
});
