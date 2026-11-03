import type { AuthAdmin } from '../accounts/delete-account';

/** An in-memory Supabase Auth. Behaves like the real one: deleting a missing user succeeds. */
export class FakeAuthAdmin implements AuthAdmin {
  private readonly users: Set<string>;
  private nextFailure: Error | undefined;

  constructor(existingAccountIds: string[] = []) {
    this.users = new Set(existingAccountIds);
  }

  has(accountId: string) {
    return this.users.has(accountId);
  }

  /** Makes the next call fail, like a Supabase outage. */
  failNextCallWith(error: Error) {
    this.nextFailure = error;
  }

  deleteUser(accountId: string) {
    const failure = this.nextFailure;
    this.nextFailure = undefined;
    if (failure) return Promise.reject(failure);

    this.users.delete(accountId);
    return Promise.resolve();
  }
}
