import { createApp, type AppDependencies } from '../app';
import { createCalmMode } from '../calm/calm-mode';
import { AccessTokenRejectedError } from '../auth/access-token';
import type { BlueskyOAuth } from '../connections/bluesky-oauth';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import { createConnectionRemoval, type CountHiddenPosts } from '../connections/connection-removal';
import type { PendingConnections } from '../connections/pending-connections';
import { FakeArchive } from './fake-archive';
import { FakeBlueskyOAuth } from './fake-bluesky-oauth';
import { FakeCalmSessions } from './fake-calm-sessions';
import { FakeConnectedAccounts } from './fake-connected-accounts';
import { FakeJobQueue } from './fake-job-queue';
import { FakePendingConnections } from './fake-pending-connections';
import { FakePlatformPosts } from './fake-platform-posts';
import { captureLogs } from './log-capture';

export const TEST_APP_RETURN_URL = new URL('calmguardian-test://connect/bluesky');

export const TEST_NOW = new Date('2026-11-04T12:00:00.000Z');

type TestAppOptions = Partial<Omit<AppDependencies, 'logger' | 'connections' | 'calm'>> & {
  connectedAccounts?: ConnectedAccountsRepository;
  bluesky?: BlueskyOAuth;
  pendingConnections?: PendingConnections;
  countHiddenPosts?: CountHiddenPosts;
};

/**
 * The real app with harmless defaults: no readiness checks, every access token rejected, account
 * deletion doing nothing, no connected accounts or hidden posts, and a fake Bluesky. Override only what a test is
 * about.
 */
export function buildTestApp({
  connectedAccounts = new FakeConnectedAccounts(),
  bluesky = new FakeBlueskyOAuth(),
  pendingConnections = new FakePendingConnections(),
  countHiddenPosts = () => Promise.resolve(0),
  ...overrides
}: TestAppOptions = {}) {
  const logs = captureLogs();
  // Calm Mode is the real core over fakes; jobs are only recorded, so tests choose when they run.
  const platform = new FakePlatformPosts();
  const archive = new FakeArchive();
  const calmSessions = new FakeCalmSessions();
  const jobQueue = new FakeJobQueue();
  const calmMode = createCalmMode({
    connectedAccounts,
    platformPosts: platform,
    archive,
    calmSessions,
    now: () => TEST_NOW,
    logger: logs.logger,
  });
  const { disconnect } = createConnectionRemoval({
    connectedAccounts,
    revokeTokens: { bluesky: (did) => bluesky.revoke(did) },
    countHiddenPosts,
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
    calm: { calmMode, jobQueue, now: () => TEST_NOW },
    ...overrides,
  });
  return { app, logs, calm: { calmMode, platform, archive, calmSessions, jobQueue } };
}
