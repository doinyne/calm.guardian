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
 * Deleting the auth user is always the last step: our tables cascade from it, and steps added before
 * it (revoking connected-account and Apple tokens) need the data it deletes.
 */
export function createAccountDeletion({ authAdmin }: { authAdmin: AuthAdmin }): DeleteAccount {
  return async (accountId) => {
    await authAdmin.deleteUser(accountId);
  };
}
