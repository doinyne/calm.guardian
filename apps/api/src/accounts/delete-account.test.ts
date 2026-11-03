import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AccountIdSchema } from './account-id';
import { createAccountDeletion } from './delete-account';

const accountId = AccountIdSchema.parse(randomUUID());

describe('account deletion', () => {
  it("revokes every connected account's tokens before deleting the user", async () => {
    const steps: string[] = [];
    const deleteAccount = createAccountDeletion({
      revokeAllConnections: (id) => {
        steps.push(`revoke connections of ${id}`);
        return Promise.resolve();
      },
      authAdmin: {
        deleteUser: (id) => {
          steps.push(`delete user ${id}`);
          return Promise.resolve();
        },
      },
    });

    await deleteAccount(accountId);

    expect(steps).toEqual([`revoke connections of ${accountId}`, `delete user ${accountId}`]);
  });

  it('keeps the user when connections could not be looked up, so a retry can finish the job', async () => {
    let userDeleted = false;
    const deleteAccount = createAccountDeletion({
      revokeAllConnections: () => Promise.reject(new Error('database unavailable')),
      authAdmin: {
        deleteUser: () => {
          userDeleted = true;
          return Promise.resolve();
        },
      },
    });

    await expect(deleteAccount(accountId)).rejects.toThrow('database unavailable');
    expect(userDeleted).toBe(false);
  });
});
