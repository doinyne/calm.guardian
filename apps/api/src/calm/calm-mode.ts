import type { CalmPeriod } from '@calm-guardian/shared';

import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccount, ConnectedAccountId } from '../connections/connected-account';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import type { Logger } from '../logger';
import type { Archive, MediaCopy } from './archive';
import type { CalmSession, CalmSessionFailure, CalmSessionId, CalmSessions } from './calm-session';
import type { PlatformPost, PlatformPosts } from './platform-posts';

export type CalmModeDependencies = {
  connectedAccounts: Pick<ConnectedAccountsRepository, 'findForAccount' | 'listForAccount'>;
  platformPosts: PlatformPosts;
  archive: Archive;
  calmSessions: CalmSessions;
  now: () => Date;
  logger: Logger;
};

export type ActivationResult =
  /** Calm Mode is on. `stillVisible` posts are backed up but couldn't be deleted. */
  | { outcome: 'active'; calmSessionId: CalmSessionId; hidden: number; stillVisible: number }
  | { outcome: 'already-active'; calmSessionId: CalmSessionId }
  /** Nothing was deleted, and Calm Mode is off. */
  | { outcome: 'failed'; calmSessionId: CalmSessionId; reason: CalmSessionFailure }
  /** The Platform stopped accepting our sign-in, so the user must connect again first. */
  | { outcome: 'needs-sign-in' };

export class ConnectedAccountNotFoundError extends Error {
  override readonly name = 'ConnectedAccountNotFoundError';
}

/**
 * Turning Calm Mode on (BUILD_PLAN M2, ADR-0011): for one connected account, back up every post in the
 * period, and only then delete them from the Platform.
 *
 * Safe to retry. A Calm session that's already on is left alone. One that was interrupted resumes:
 * backups are keyed by post, so nothing is stored twice, and Platforms treat deleting a deleted post
 * as done. Retries with backoff belong to the job runner, not here.
 */
export function createCalmMode({
  connectedAccounts,
  platformPosts,
  archive,
  calmSessions,
  now,
  logger,
}: CalmModeDependencies) {
  async function activate({
    accountId,
    connectedAccountId,
    period,
  }: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
    period: CalmPeriod;
  }): Promise<ActivationResult> {
    const connectedAccount = await connectedAccounts.findForAccount({
      accountId,
      connectedAccountId,
    });
    if (!connectedAccount) throw new ConnectedAccountNotFoundError();
    return activateConnectedAccount(connectedAccount, period);
  }

  /** "Turn on for all": each connected account gets its own Calm session, whatever happens to the others. */
  async function activateAll({ accountId, period }: { accountId: AccountId; period: CalmPeriod }) {
    const results: { connectedAccountId: ConnectedAccountId; result: ActivationResult }[] = [];
    for (const connectedAccount of await connectedAccounts.listForAccount(accountId)) {
      results.push({
        connectedAccountId: connectedAccount.id,
        result: await activateConnectedAccount(connectedAccount, period),
      });
    }
    return results;
  }

  async function activateConnectedAccount(
    connectedAccount: ConnectedAccount,
    period: CalmPeriod,
  ): Promise<ActivationResult> {
    if (connectedAccount.status !== 'active') return { outcome: 'needs-sign-in' };

    const calmSession = await calmSessions.openFor({
      accountId: connectedAccount.accountId,
      connectedAccountId: connectedAccount.id,
      period,
      startedAt: now(),
    });
    if (calmSession.state === 'active') {
      return { outcome: 'already-active', calmSessionId: calmSession.id };
    }

    const backupFailure = await backUpPeriod(connectedAccount, calmSession);
    if (backupFailure) {
      await calmSessions.markFailed({
        calmSessionId: calmSession.id,
        reason: backupFailure,
        failedAt: now(),
      });
      return { outcome: 'failed', calmSessionId: calmSession.id, reason: backupFailure };
    }

    const { stillVisible } = await hideBackedUpPosts(connectedAccount, calmSession.id);
    await calmSessions.markActive({ calmSessionId: calmSession.id, activatedAt: now() });
    return {
      outcome: 'active',
      calmSessionId: calmSession.id,
      hidden: await archive.countHidden(calmSession.id),
      stillVisible,
    };
  }

  /**
   * Backs up every post in the session's period, page by page. Returns why it stopped, if it did.
   * Nothing is deleted until this has finished for every page.
   */
  async function backUpPeriod(
    connectedAccount: ConnectedAccount,
    calmSession: CalmSession,
  ): Promise<CalmSessionFailure | undefined> {
    let cursor: string | undefined;
    do {
      let page;
      try {
        page = await platformPosts.listPosts({
          connectedAccount,
          period: calmSession.period,
          ...(cursor === undefined ? {} : { cursor }),
        });
      } catch (error) {
        logFailure(error, calmSession, 'Could not list posts; nothing was hidden');
        return 'could-not-read-posts';
      }

      for (const post of page.posts) {
        let media;
        try {
          media = await copyMedia(connectedAccount, post);
        } catch (error) {
          logFailure(error, calmSession, "Could not fetch a post's files; nothing was hidden");
          return 'could-not-read-posts';
        }

        try {
          await archive.save({
            accountId: connectedAccount.accountId,
            calmSessionId: calmSession.id,
            connectedAccountId: connectedAccount.id,
            post,
            media,
            backedUpAt: now(),
          });
        } catch (error) {
          logFailure(error, calmSession, 'Could not back up a post; nothing was hidden');
          return 'backup-failed';
        }
      }

      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return undefined;
  }

  /** One at a time, so a post with large files doesn't hold a whole page of them in memory. */
  async function copyMedia(
    connectedAccount: ConnectedAccount,
    post: PlatformPost,
  ): Promise<MediaCopy[]> {
    const copies: MediaCopy[] = [];
    for (const media of post.media) {
      copies.push({ ...media, bytes: await platformPosts.fetchMedia({ connectedAccount, media }) });
    }
    return copies;
  }

  /**
   * Deletes each of the session's backed-up posts from the Platform. A post that won't delete stays
   * visible and stays in the Archive, and is counted honestly rather than reported as hidden.
   */
  async function hideBackedUpPosts(
    connectedAccount: ConnectedAccount,
    calmSessionId: CalmSessionId,
  ) {
    let stillVisible = 0;
    for (const post of await archive.listNotHidden(calmSessionId)) {
      try {
        await platformPosts.deletePost({ connectedAccount, post });
      } catch (error) {
        stillVisible += 1;
        logger.warn(
          { calmSessionId, archivedPostId: post.id, errorName: errorName(error) },
          'Could not delete a backed-up post; it is still visible',
        );
        continue;
      }
      await archive.markHidden({ archivedPostId: post.id, hiddenAt: now() });
    }
    return { stillVisible };
  }

  function logFailure(error: unknown, calmSession: CalmSession, message: string) {
    logger.warn({ calmSessionId: calmSession.id, errorName: errorName(error) }, message);
  }

  return { activate, activateAll };
}

/** Error details can carry post text or tokens, so logs only ever get the error's name. */
function errorName(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}
