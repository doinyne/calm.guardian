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
import { createConnectedAccountsRepository } from './connections/connected-accounts-repository';
import { createConnectionRemoval } from './connections/connection-removal';
import { createPendingConnections } from './connections/pending-connections';
import { createSecretBox } from './crypto/secret-box';
import { createInProcessJobQueue } from './jobs/in-process-job-queue';
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
  redirectUrl: config.bluesky.redirectUrl,
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
const calmMode = createCalmMode({
  connectedAccounts,
  platformPosts: createBlueskyPosts({ repoFor: bluesky.repoFor, logger }),
  archive,
  calmSessions,
  now,
  logger,
});

// Local and single-instance for now; Cloud Tasks replaces it when we deploy (ADR-0015, M0b).
const jobs: { runActivation?: ReturnType<typeof createActivationJob> } = {};
const jobQueue = createInProcessJobQueue({
  handlers: () => ({
    'activate-calm-mode': (payload) =>
      jobs.runActivation
        ? jobs.runActivation(payload)
        : Promise.reject(new Error('Job handlers are not ready')),
  }),
  logger,
  now,
});
jobs.runActivation = createActivationJob({ calmMode, calmSessions, jobQueue, now, logger });

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
  },
  calm: { calmMode, jobQueue, now },
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port }, 'API listening');
});

// Cloud Run sends SIGTERM and allows ~10 seconds before killing the instance. Stop accepting new
// connections, let in-flight requests finish, then close the database pool.
for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down');
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
