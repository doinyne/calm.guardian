import { accountAuth } from '@/account/account-auth-client';

import { FakeAccountAuth } from './fake-account-auth';

/** The fake that jest.setup.js puts in place of the real sign-in client. */
export function fakeAccountAuth(): FakeAccountAuth {
  if (!(accountAuth instanceof FakeAccountAuth)) {
    throw new Error('Expected jest.setup.js to replace the sign-in client with FakeAccountAuth');
  }
  return accountAuth;
}
