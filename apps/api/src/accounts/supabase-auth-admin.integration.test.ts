import { afterAll, describe, expect, it } from 'vitest';

import { connectToLocalSupabase } from '../testing/local-supabase';
import { AccountIdSchema } from './account-id';
import { createSupabaseAuthAdmin } from './supabase-auth-admin';

describe('Supabase Auth admin (local Supabase)', () => {
  const supabase = connectToLocalSupabase();
  const authAdmin = createSupabaseAuthAdmin(supabase.config);
  const leftovers: string[] = [];

  afterAll(async () => {
    await Promise.all(leftovers.map((id) => supabase.admin.auth.admin.deleteUser(id)));
  });

  it('deletes the user, and succeeds again when the user is already gone', async () => {
    const user = await supabase.createTestUser();
    const accountId = AccountIdSchema.parse(user.id);

    await authAdmin.deleteUser(accountId);
    await authAdmin.deleteUser(accountId);

    const { error } = await supabase.admin.auth.admin.getUserById(accountId);
    expect(error?.code).toBe('user_not_found');
  });

  it('reports a failure instead of pretending the user was deleted', async () => {
    const user = await supabase.createTestUser();
    leftovers.push(user.id);
    const withWrongKey = createSupabaseAuthAdmin({
      url: supabase.config.url,
      secretKey: 'sb_secret_not_the_real_key',
    });

    await expect(withWrongKey.deleteUser(AccountIdSchema.parse(user.id))).rejects.toThrow();

    const { data } = await supabase.admin.auth.admin.getUserById(user.id);
    expect(data.user?.id).toBe(user.id);
  });
});
