import { createApp, type AppDependencies } from '../app';
import { AccessTokenRejectedError } from '../auth/access-token';
import type { BlueskyOAuth } from '../connections/bluesky-oauth';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import { createConnectionRemoval } from '../connections/connection-removal';
import type { PendingConnections } from '../connections/pending-connections';
import { FakeBlueskyOAuth } from './fake-bluesky-oauth';
import { FakeConnectedAccounts } from './fake-connected-accounts';
import { FakePendingConnections } from './fake-pending-connections';
import { captureLogs } from './log-capture';

export const TEST_APP_RETURN_URL = new URL('calmguardian-test://connect/bluesky');

type TestAppOptions = Partial<Omit<AppDependencies, 'logger' | 'connections'>> & {
  connectedAccounts?: ConnectedAccountsRepository;
  bluesky?: BlueskyOAuth;
  pendingConnections?: PendingConnections;
};

/**
 * The real app with harmless defaults: no readiness checks, every access token rejected, account
 * deletion doing nothing, no connected accounts and a fake Bluesky. Override only what a test is
 * about.
 */
export function buildTestApp({
  connectedAccounts = new FakeConnectedAccounts(),
  bluesky = new FakeBlueskyOAuth(),
  pendingConnections = new FakePendingConnections(),
  ...overrides
}: TestAppOptions = {}) {
  const logs = captureLogs();
  const { disconnect } = createConnectionRemoval({
    connectedAccounts,
    revokeTokens: { bluesky: (did) => bluesky.revoke(did) },
    logger: logs.logger,
  });
  const app = createApp({
    logger: logs.logger,
    readinessChecks: [],
    verifyAccessToken: () => Promise.reject(new AccessTokenRejectedError('no_test_tokens')),
    deleteAccount: () => Promise.resolve(),
    connections: {
      connectedAccounts,
      bluesky,
      pendingConnections,
      disconnect,
      appReturnUrl: TEST_APP_RETURN_URL,
    },
    ...overrides,
  });
  return { app, logs };
}
