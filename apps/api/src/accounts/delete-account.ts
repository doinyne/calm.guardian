import type { AccountId } from './account-id';

/** What account deletion needs from Supabase Auth. */
export type AuthAdmin = {
  /** Permanently deletes the auth user. Resolves if the user is already gone, so retries are safe. */
  deleteUser: (accountId: AccountId) => Promise<void>;
};

export type DeleteAccount = (accountId: AccountId) => Promise<void>;

/**
 * Deletes everything we hold for an Account. Every step is idempotent, so retrying after a partial
 * failure finishes the job.
 *
 * Deleting the auth user is always the last step: our tables cascade from it, and the steps before it
 * (revoking connected accounts' tokens, and Apple's once Sign in with Apple lands) need the data it
 * deletes.
 */
export function createAccountDeletion({
  revokeAllConnections,
  authAdmin,
}: {
  /** Revokes our tokens on every Platform; our copies go when the user is deleted. */
  revokeAllConnections: (accountId: AccountId) => Promise<void>;
  authAdmin: AuthAdmin;
}): DeleteAccount {
  return async (accountId) => {
    await revokeAllConnections(accountId);
    await authAdmin.deleteUser(accountId);
  };
}
