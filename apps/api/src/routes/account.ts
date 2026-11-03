import { Hono } from 'hono';

import type { DeleteAccount } from '../accounts/delete-account';
import type { RequireAccount } from '../http/require-account';

type AccountDependencies = {
  requireAccount: RequireAccount;
  deleteAccount: DeleteAccount;
};

/** The signed-in user's own Account. */
export function accountRoutes({ requireAccount, deleteAccount }: AccountDependencies) {
  return new Hono().delete('/account', requireAccount, async (c) => {
    await deleteAccount(c.var.accountId);
    return c.body(null, 204);
  });
}
