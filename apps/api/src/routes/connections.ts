import { Hono } from 'hono';

import type { ConnectedAccount } from '../connections/connected-account';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import type { RequireAccount } from '../http/require-account';

type ConnectionsDependencies = {
  requireAccount: RequireAccount;
  connectedAccounts: ConnectedAccountsRepository;
};

/** The signed-in user's connected accounts. Connecting and disconnecting arrive with Bluesky OAuth. */
export function connectionsRoutes({ requireAccount, connectedAccounts }: ConnectionsDependencies) {
  return new Hono().get('/connections', requireAccount, async (c) => {
    const accounts = await connectedAccounts.listForAccount(c.var.accountId);
    return c.json({ connectedAccounts: accounts.map(toConnectionResponse) });
  });
}

/** What the app sees. The Platform's own ID stays on the server: the app has no use for it. */
function toConnectionResponse({ id, platform, handle, status, connectedAt }: ConnectedAccount) {
  return { id, platform, handle, status, connectedAt: connectedAt.toISOString() };
}
