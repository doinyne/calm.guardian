import { SignInError, type AccountAuth, type SignedInAccount } from '@/account/account-auth';

type SessionListener = (account: SignedInAccount | null) => void;

/** An in-memory sign-in provider. Every emailed code is `FakeAccountAuth.CODE`. */
export class FakeAccountAuth implements AccountAuth {
  static readonly CODE = '123456';

  readonly codesSentTo: string[] = [];
  private account: SignedInAccount | null = null;
  private readonly listeners = new Set<SessionListener>();
  private nextFailure: Error | undefined;

  /** Starts a test already signed in, as if a session had been saved on the device. */
  signInAs(account: SignedInAccount) {
    this.setAccount(account);
  }

  /** Makes the next call fail, e.g. with `new SignInError('network')`. */
  failNextCallWith(error: Error) {
    this.nextFailure = error;
  }

  reset() {
    this.codesSentTo.length = 0;
    this.nextFailure = undefined;
    this.setAccount(null);
  }

  onSessionChange(listener: SessionListener) {
    this.listeners.add(listener);
    listener(this.account);
    return () => {
      this.listeners.delete(listener);
    };
  }

  sendSignInCode(email: string) {
    return this.attempt(() => {
      this.codesSentTo.push(email);
    });
  }

  verifySignInCode({ email, code }: { email: string; code: string }) {
    return this.attempt(() => {
      if (code !== FakeAccountAuth.CODE || !this.codesSentTo.includes(email)) {
        throw new SignInError('invalid-code');
      }
      this.setAccount({ id: 'fake-account-id', email });
    });
  }

  getAccessToken() {
    return this.attempt(() => (this.account ? 'fake-access-token' : null));
  }

  signOutThisDevice() {
    return this.attempt(() => this.setAccount(null));
  }

  private attempt<T>(action: () => T): Promise<T> {
    const failure = this.nextFailure;
    this.nextFailure = undefined;
    if (failure) return Promise.reject(failure);

    try {
      return Promise.resolve(action());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private setAccount(account: SignedInAccount | null) {
    this.account = account;
    for (const listener of this.listeners) listener(account);
  }
}
