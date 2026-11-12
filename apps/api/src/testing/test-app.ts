import { createApp, type AppDependencies } from '../app';
import { createCalmMode } from '../calm/calm-mode';
import { createRestore } from '../calm/restore';
import { createGuardianNotices } from '../guardians/guardian-notices';
import { createGuardians } from '../guardians/guardians';
import { FakeEmailSender } from './fake-email-sender';
import { AccessTokenRejectedError } from '../auth/access-token';
import type { BlueskyOAuth } from '../connections/bluesky-oauth';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import { createConnectionRemoval, type CountHiddenPosts } from '../connections/connection-removal';
import type { PendingConnections } from '../connections/pending-connections';
import { FakeArchive } from './fake-archive';
import { FakeBlueskyOAuth } from './fake-bluesky-oauth';
import { FakeCalmSessions } from './fake-calm-sessions';
import { FakeConnectedAccounts } from './fake-connected-accounts';
import { FakeGuardianships } from './fake-guardianships';
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
  blueskyClientMetadata?: Readonly<Record<string, unknown>>;
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
  blueskyClientMetadata,
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
  const guardianships = new FakeGuardianships();
  const email = new FakeEmailSender();
  const guardians = createGuardians({
    guardianships,
    connectedAccounts,
    archive,
    calmMode,
    calmSessions,
    now: () => TEST_NOW,
  });
  const restore = createRestore({
    connectedAccounts,
    calmSessions,
    archive,
    platformPosts: platform,
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
      ...(blueskyClientMetadata ? { blueskyClientMetadata } : {}),
    },
    calm: {
      calmMode,
      jobQueue,
      now: () => TEST_NOW,
      guardianEmails: async (accountId) =>
        new Map(
          (await guardianships.listForAccount(accountId)).map((row) => [row.id, row.guardianEmail]),
        ),
    },
    review: { restore, archive, jobQueue },
    guardians: {
      guardians,
      notices: createGuardianNotices({
        guardianships,
        connectedAccounts,
        calmSessions,
        email,
        publicApiUrl: new URL('http://localhost:3000'),
      }),
      jobQueue,
      now: () => TEST_NOW,
      logger: logs.logger,
    },
    ...overrides,
  });
  return {
    app,
    logs,
    calm: { calmMode, restore, platform, archive, calmSessions, jobQueue, guardianships, email },
  };
}
