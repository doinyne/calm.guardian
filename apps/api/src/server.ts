import { serve } from '@hono/node-server';
import { createRemoteJWKSet } from 'jose';

import { createAccountDeletion } from './accounts/delete-account';
import { createSupabaseAuthAdmin } from './accounts/supabase-auth-admin';
import { createApp } from './app';
import { createAccessTokenVerifier } from './auth/access-token';
import { loadConfig } from './config';
import { createAtprotoBlueskyOAuth } from './connections/atproto-bluesky-oauth';
import { createBlueskyPosts } from './bluesky/bluesky-posts';
import { createActivationJob } from './calm/activation-job';
import { createArchiveRepository } from './calm/archive-repository';
import { createCalmMode } from './calm/calm-mode';
import { createCalmSessionsRepository } from './calm/calm-sessions-repository';
import { createRestore } from './calm/restore';
import { createLoggingEmailSender, createSmtpEmailSender } from './email/email-sender';
import { createGuardianNotices } from './guardians/guardian-notices';
import { createGuardians } from './guardians/guardians';
import { createGuardianshipsRepository } from './guardians/guardianships-repository';
import { createRestoreAllJob } from './calm/restore-all-job';
import { createSweepJob, createSweepSchedule } from './calm/sweep-job';
import { createConnectedAccountsRepository } from './connections/connected-accounts-repository';
import { createConnectionRemoval } from './connections/connection-removal';
import { createPendingConnections } from './connections/pending-connections';
import { createSecretBox } from './crypto/secret-box';
import { createGoogleCallerVerifier, GOOGLE_SIGNING_KEYS_URL } from './internal/google-caller';
import { createCloudTasksJobQueue, metadataServerAccessToken } from './jobs/cloud-tasks-job-queue';
import { createInProcessJobQueue } from './jobs/in-process-job-queue';
import type { JobHandlers } from './jobs/job-queue';
import { createDatabase, databaseReadinessCheck } from './db/database';
import { createLogger } from './logger';

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

// Supabase caches its signing keys for 10 minutes; a key we haven't seen triggers a refetch anyway.
const SIGNING_KEYS_CACHE_MS = 10 * 60 * 1000;

const config = loadConfig(process.env);
const logger = createLogger({ level: config.logLevel });
const db = createDatabase(config.databaseUrl);
const secretBox = createSecretBox(config.tokenEncryptionKeys);
const connectedAccounts = createConnectedAccountsRepository(db);
const archive = createArchiveRepository({ db, secretBox });

const bluesky = createAtprotoBlueskyOAuth({
  db,
  secretBox,
  client: config.bluesky.client,
  onSessionEnded: (did) => {
    connectedAccounts
      .markNeedsReauth({ platform: 'bluesky', externalId: did })
      .catch((error: unknown) => {
        logger.error(
          { err: error },
          'Could not mark a Bluesky connection as needing a new sign-in',
        );
      });
  },
});

const connectionRemoval = createConnectionRemoval({
  connectedAccounts,
  revokeTokens: { bluesky: (did) => bluesky.revoke(did) },
  countHiddenPosts: archive.countHiddenForConnectedAccount,
  logger,
});

const now = () => new Date();
const calmSessions = createCalmSessionsRepository(db);
const platformPosts = createBlueskyPosts({ repoFor: bluesky.repoFor, logger });
const calmMode = createCalmMode({
  connectedAccounts,
  platformPosts,
  archive,
  calmSessions,
  now,
  logger,
});
const restore = createRestore({
  connectedAccounts,
  calmSessions,
  archive,
  platformPosts,
  now,
  logger,
});

// Background work (ADR-0015, ADR-0017): in this process locally; through Cloud Tasks when deployed, so
// Cloud Run can scale to zero and stay on the free tier.
const jobs: {
  runActivation?: ReturnType<typeof createActivationJob>;
  runRestoreAll?: ReturnType<typeof createRestoreAllJob>;
  runSweep?: ReturnType<typeof createSweepJob>;
} = {};
const notReady = () => Promise.reject(new Error('Job handlers are not ready'));
const jobHandlers = (): JobHandlers => ({
  'activate-calm-mode': (payload) =>
    jobs.runActivation ? jobs.runActivation(payload) : notReady(),
  'restore-all': (payload) => (jobs.runRestoreAll ? jobs.runRestoreAll(payload) : notReady()),
  sweep: (payload) => (jobs.runSweep ? jobs.runSweep(payload) : notReady()),
});
const jobQueue =
  config.jobs.kind === 'cloud-tasks'
    ? createCloudTasksJobQueue({
        settings: {
          queue: config.jobs.queue,
          apiUrl: config.publicApiUrl,
          invokerEmail: config.jobs.invokerEmail,
        },
        accessToken: metadataServerAccessToken(),
      })
    : createInProcessJobQueue({ handlers: jobHandlers, logger, now });
jobs.runActivation = createActivationJob({
  calmMode,
  calmSessions,
  jobQueue,
  now,
  logger,
  onCalmModeOn: (calmSessionId) => guardianNotices.calmModeOn(calmSessionId),
});
jobs.runRestoreAll = createRestoreAllJob({ restore, jobQueue, now, logger });
jobs.runSweep = createSweepJob({ calmMode, calmSessions, jobQueue, now, logger });

// The Sweep's schedule: Cloud Scheduler calls /internal/sweep when deployed; a timer locally.
const queueSweeps = createSweepSchedule({ calmSessions, jobQueue });
const sweepTimer =
  config.jobs.kind === 'in-process'
    ? setInterval(() => {
        queueSweeps().catch((error: unknown) => {
          logger.error(
            { errorName: error instanceof Error ? error.name : typeof error },
            'Could not queue the Sweep',
          );
        });
      }, config.sweepIntervalMs)
    : undefined;

const guardianships = createGuardianshipsRepository(db);
const guardianNotices = createGuardianNotices({
  guardianships,
  connectedAccounts,
  calmSessions,
  email: config.smtpUrl
    ? createSmtpEmailSender({ smtpUrl: config.smtpUrl, from: config.emailFrom })
    : createLoggingEmailSender(logger),
  publicApiUrl: config.publicApiUrl,
});

const internal =
  config.jobs.kind === 'cloud-tasks'
    ? {
        verifyGoogleCaller: createGoogleCallerVerifier({
          keys: createRemoteJWKSet(new URL(GOOGLE_SIGNING_KEYS_URL)),
          audience: config.publicApiUrl.origin,
          invokerEmail: config.jobs.invokerEmail,
        }),
        handlers: jobHandlers,
        queueSweeps,
      }
    : undefined;

const app = createApp({
  logger,
  readinessChecks: [databaseReadinessCheck(db)],
  verifyAccessToken: createAccessTokenVerifier({
    keys: createRemoteJWKSet(config.supabase.jwksUrl, { cacheMaxAge: SIGNING_KEYS_CACHE_MS }),
    issuer: config.supabase.authIssuer,
  }),
  deleteAccount: createAccountDeletion({
    revokeAllConnections: connectionRemoval.revokeAll,
    authAdmin: createSupabaseAuthAdmin(config.supabase),
  }),
  connections: {
    connectedAccounts,
    bluesky,
    pendingConnections: createPendingConnections({ db, secretBox }),
    disconnect: connectionRemoval.disconnect,
    appReturnUrl: config.bluesky.appReturnUrl,
    ...(config.bluesky.client.kind === 'public'
      ? { blueskyClientMetadata: bluesky.clientMetadata }
      : {}),
  },
  calm: {
    calmMode,
    jobQueue,
    now,
    guardianEmails: async (accountId) =>
      new Map(
        (await guardianships.listForAccount(accountId)).map((row) => [row.id, row.guardianEmail]),
      ),
  },
  review: { restore, archive, jobQueue },
  ...(internal ? { internal } : {}),
  guardians: {
    guardians: createGuardians({
      guardianships,
      connectedAccounts,
      archive,
      calmMode,
      calmSessions,
      now,
    }),
    notices: guardianNotices,
    jobQueue,
    now,
    logger,
  },
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port }, 'API listening');
});

// Cloud Run sends SIGTERM and allows ~10 seconds before killing the instance. Stop accepting new
// connections, let in-flight requests finish, then close the database pool.
for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down');
    if (sweepTimer) clearInterval(sweepTimer);
    server.close((serverError) => {
      if (serverError) logger.error({ err: serverError }, 'Error while closing the server');
      db.destroy().then(
        () => process.exit(serverError ? 1 : 0),
        (dbError: unknown) => {
          logger.error({ err: dbError }, 'Error while closing the database pool');
          process.exit(1);
        },
      );
    });
  });
}
