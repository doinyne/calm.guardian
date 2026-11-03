import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import type { AccountAuth, SignedInAccount } from './account-auth';

export type AccountSession =
  | { status: 'restoring' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; account: SignedInAccount };

const AccountAuthContext = createContext<AccountAuth | null>(null);
const AccountSessionContext = createContext<AccountSession>({ status: 'restoring' });

/** Tracks whether someone is signed in, starting from the session saved on this device. */
export function AccountSessionProvider({
  auth,
  children,
}: {
  auth: AccountAuth;
  children: ReactNode;
}) {
  const [session, setSession] = useState<AccountSession>({ status: 'restoring' });

  useEffect(
    () =>
      auth.onSessionChange((account) =>
        setSession(account ? { status: 'signed-in', account } : { status: 'signed-out' }),
      ),
    [auth],
  );

  return (
    <AccountAuthContext value={auth}>
      <AccountSessionContext value={session}>{children}</AccountSessionContext>
    </AccountAuthContext>
  );
}

export function useAccountSession(): AccountSession {
  return use(AccountSessionContext);
}

export function useAccountAuth(): AccountAuth {
  const auth = use(AccountAuthContext);
  if (!auth) throw new Error('useAccountAuth must be used inside AccountSessionProvider');
  return auth;
}
