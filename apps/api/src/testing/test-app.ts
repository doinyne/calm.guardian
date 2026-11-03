import { createApp, type AppDependencies } from '../app';
import { AccessTokenRejectedError } from '../auth/access-token';
import { FakeConnectedAccounts } from './fake-connected-accounts';
import { captureLogs } from './log-capture';

/**
 * The real app with harmless defaults: no readiness checks, every access token rejected, account
 * deletion doing nothing, and no connected accounts. Override only what a test is about.
 */
export function buildTestApp(overrides: Partial<Omit<AppDependencies, 'logger'>> = {}) {
  const logs = captureLogs();
  const app = createApp({
    logger: logs.logger,
    readinessChecks: [],
    verifyAccessToken: () => Promise.reject(new AccessTokenRejectedError('no_test_tokens')),
    deleteAccount: () => Promise.resolve(),
    connectedAccounts: new FakeConnectedAccounts(),
    ...overrides,
  });
  return { app, logs };
}
