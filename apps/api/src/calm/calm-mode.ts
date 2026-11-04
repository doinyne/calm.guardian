import type { CalmPeriod } from '@calm-guardian/shared';

import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccount, ConnectedAccountId } from '../connections/connected-account';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import type { Logger } from '../logger';
import type { Archive, BackedUpPost, MediaCopy } from './archive';
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
  /**
   * Stopped partway: `hidden` posts are hidden (and safely backed up), the rest aren't yet. The Calm
   * session is still activating, and activating again carries on from here.
   */
  | {
      outcome: 'interrupted';
      calmSessionId: CalmSessionId;
      hidden: number;
      reason: CalmSessionFailure;
    }
  /** The Platform stopped accepting our sign-in, so the user must connect again first. */
  | { outcome: 'needs-sign-in' };

export class ConnectedAccountNotFoundError extends Error {
  override readonly name = 'ConnectedAccountNotFoundError';
}

/**
 * Turning Calm Mode on (BUILD_PLAN M2, ADR-0011, ADR-0015): for one connected account, work through the
 * period's posts **newest first**, backing up each post and its files, and deleting it from the
 * Platform as soon as that backup is stored. A post from this morning is hidden in seconds, without
 * waiting for years of older posts. No post is ever deleted before its own backup (product rule 1).
 *
 * Safe to retry. A Calm session that's already on is left alone. One that was interrupted resumes:
 * backups are keyed by post, so nothing is stored twice; hidden posts are no longer listed; and
 * Platforms treat deleting a deleted post as done. Retries with backoff belong to the job runner.
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

    const stopped = await hidePeriodNewestFirst(connectedAccount, calmSession);
    if (stopped) return stopEarly(calmSession, stopped);

    // Anything backed up but not yet hidden: a delete that failed, or one that worked just before an
    // earlier run was interrupted. One more try, and what's left is reported as still visible.
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
   * Before anything is hidden, stopping means Calm Mode stays off and nothing changed. After that,
   * the hidden posts stay hidden and the session stays open for the next run to finish.
   */
  async function stopEarly(
    calmSession: CalmSession,
    reason: CalmSessionFailure,
  ): Promise<ActivationResult> {
    const hidden = await archive.countHidden(calmSession.id);
    if (hidden > 0) {
      return { outcome: 'interrupted', calmSessionId: calmSession.id, hidden, reason };
    }
    await calmSessions.markFailed({ calmSessionId: calmSession.id, reason, failedAt: now() });
    return { outcome: 'failed', calmSessionId: calmSession.id, reason };
  }

  /**
   * Page by page, newest first: back up each post with its files, then delete it straight away.
   * Returns why it stopped early, if it did. A delete that fails doesn't stop it: that post stays
   * visible and backed up, and is tried again at the end.
   */
  async function hidePeriodNewestFirst(
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
        logFailure(error, calmSession, 'Could not list posts; stopped');
        return 'could-not-read-posts';
      }

      for (const post of page.posts) {
        const backup = await backUp(connectedAccount, calmSession, post);
        if (backup.failure) return backup.failure;
        await hide(connectedAccount, calmSession.id, backup.post);
      }

      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return undefined;
  }

  /** Stores the post and copies of its files. Only what this returns can be deleted. */
  async function backUp(
    connectedAccount: ConnectedAccount,
    calmSession: CalmSession,
    post: PlatformPost,
  ): Promise<
    { failure: CalmSessionFailure; post?: never } | { failure?: never; post: BackedUpPost }
  > {
    let media;
    try {
      media = await copyMedia(connectedAccount, post);
    } catch (error) {
      logFailure(error, calmSession, "Could not fetch a post's files; stopped before hiding it");
      return { failure: 'could-not-read-posts' };
    }

    try {
      return {
        post: await archive.save({
          accountId: connectedAccount.accountId,
          calmSessionId: calmSession.id,
          connectedAccountId: connectedAccount.id,
          post,
          media,
          backedUpAt: now(),
        }),
      };
    } catch (error) {
      logFailure(error, calmSession, 'Could not back up a post; stopped before hiding it');
      return { failure: 'backup-failed' };
    }
  }

  /** Deletes a backed-up post and records it as hidden. Returns whether it's now hidden. */
  async function hide(
    connectedAccount: ConnectedAccount,
    calmSessionId: CalmSessionId,
    post: BackedUpPost,
  ): Promise<boolean> {
    try {
      await platformPosts.deletePost({ connectedAccount, post });
    } catch (error) {
      logger.warn(
        { calmSessionId, archivedPostId: post.id, errorName: errorName(error) },
        'Could not delete a backed-up post; it is still visible',
      );
      return false;
    }
    await archive.markHidden({ archivedPostId: post.id, hiddenAt: now() });
    return true;
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

  /** Tries once more to hide whatever the session has backed up but not hidden. */
  async function hideBackedUpPosts(
    connectedAccount: ConnectedAccount,
    calmSessionId: CalmSessionId,
  ) {
    let stillVisible = 0;
    for (const post of await archive.listNotHidden(calmSessionId)) {
      if (!(await hide(connectedAccount, calmSessionId, post))) stillVisible += 1;
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
