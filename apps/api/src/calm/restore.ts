import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccountId } from '../connections/connected-account';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import type { Logger } from '../logger';
import type { ArchivedPostId, ReviewArchive } from './archive';
import { ConnectedAccountNotFoundError } from './calm-mode';
import type { CalmSessions } from './calm-session';
import { PlatformRateLimitedError, type PlatformPosts } from './platform-posts';

export type RestoreDependencies = {
  connectedAccounts: Pick<ConnectedAccountsRepository, 'findForAccount'>;
  calmSessions: Pick<CalmSessions, 'findOpenFor'>;
  archive: ReviewArchive;
  platformPosts: Pick<PlatformPosts, 'uploadMedia' | 'restorePost'>;
  now: () => Date;
  logger: Logger;
};

export type RestoreResult =
  | { outcome: 'restored' }
  | { outcome: 'already-restored' }
  /** Calm Mode is on for that account, and would hide the post again. Turn it off first. */
  | { outcome: 'calm-mode-on' }
  | { outcome: 'needs-sign-in' }
  /** The Platform asked us to slow down. The post stays hidden; try again at `until`. */
  | { outcome: 'waiting'; until: Date };

export type RestoreAllResult =
  /** Every post that could be restored is back. `notRestored` ones the Platform refused stay in Review. */
  | { outcome: 'done'; notRestored?: number }
  | { outcome: 'in-progress' }
  | { outcome: 'waiting'; until: Date }
  | { outcome: 'calm-mode-on' }
  | { outcome: 'needs-sign-in' };

export class ArchivedPostNotFoundError extends Error {
  override readonly name = 'ArchivedPostNotFoundError';
}

/** Restore all works through posts this many at a time. */
const RESTORE_BATCH = 100;

/**
 * Review and Restore (BUILD_PLAN M5). A restored post comes back **exactly as it was**: the same
 * record at the same address (Dean, 2026-11-04), so likes, replies and quotes reconnect and threads
 * rebuild themselves.
 *
 * Retry-safe (product rule 2): the post is recorded as restored straight after it's re-created, and if
 * a retry finds it already there, that counts as restored. Restoring twice never makes two posts.
 */
export function createRestore({
  connectedAccounts,
  calmSessions,
  archive,
  platformPosts,
  now,
  logger,
}: RestoreDependencies) {
  async function restore({
    accountId,
    archivedPostId,
  }: {
    accountId: AccountId;
    archivedPostId: ArchivedPostId;
  }): Promise<RestoreResult> {
    const item = await archive.find({ accountId, archivedPostId });
    if (!item) throw new ArchivedPostNotFoundError();
    if (item.state === 'restored') return { outcome: 'already-restored' };

    const blocked = await checkCanRestore(accountId, item.connectedAccountId);
    if (blocked) return blocked;
    const connectedAccount = await connectedAccounts.findForAccount({
      accountId,
      connectedAccountId: item.connectedAccountId,
    });
    if (!connectedAccount) return { outcome: 'needs-sign-in' };

    try {
      // Files first: the post refers to them, and they're only kept on Bluesky once a record uses them.
      for (const media of item.media) {
        await platformPosts.uploadMedia({ connectedAccount, media });
      }
      await platformPosts.restorePost({ connectedAccount, post: item.post });
    } catch (error) {
      if (error instanceof PlatformRateLimitedError)
        return { outcome: 'waiting', until: error.retryAt };
      throw error;
    }
    await archive.markRestored({ archivedPostId, restoredAt: now() });
    return { outcome: 'restored' };
  }

  /**
   * Restores every hidden post of the connected account that isn't kept hidden, oldest first, until
   * done or `deadline`. A post the Platform refuses is skipped (it stays in Review); being asked to
   * slow down stops the run.
   */
  async function restoreAll({
    accountId,
    connectedAccountId,
    deadline,
  }: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
    deadline?: Date;
  }): Promise<RestoreAllResult> {
    const refused = new Set<ArchivedPostId>();
    let restoredThisRun = 0;

    for (;;) {
      const batch = (
        await archive.listToRestore({ connectedAccountId, limit: refused.size + RESTORE_BATCH })
      ).filter((id) => !refused.has(id));
      if (batch.length === 0) {
        return refused.size > 0
          ? { outcome: 'done', notRestored: refused.size }
          : { outcome: 'done' };
      }

      for (const archivedPostId of batch) {
        if (deadline && restoredThisRun > 0 && now() >= deadline) return { outcome: 'in-progress' };

        let result: RestoreResult;
        try {
          result = await restore({ accountId, archivedPostId });
        } catch (error) {
          refused.add(archivedPostId);
          logger.warn(
            { archivedPostId, errorName: error instanceof Error ? error.name : typeof error },
            'Could not restore a post; it stays hidden, in Review',
          );
          continue;
        }
        if (result.outcome === 'restored' || result.outcome === 'already-restored') {
          restoredThisRun += 1;
          continue;
        }
        return result;
      }
    }
  }

  async function keepHidden({
    accountId,
    archivedPostId,
  }: {
    accountId: AccountId;
    archivedPostId: ArchivedPostId;
  }) {
    const item = await archive.find({ accountId, archivedPostId });
    if (!item) throw new ArchivedPostNotFoundError();
    if (item.state === 'to-review') await archive.markKeptHidden({ archivedPostId, keptAt: now() });
  }

  /** Our copy goes for good. If the post is still hidden, it's gone from Bluesky for good too. */
  async function deleteForGood({
    accountId,
    archivedPostId,
  }: {
    accountId: AccountId;
    archivedPostId: ArchivedPostId;
  }) {
    const item = await archive.find({ accountId, archivedPostId });
    if (!item) throw new ArchivedPostNotFoundError();
    await archive.deleteForGood({ accountId, archivedPostId });
  }

  async function checkCanRestore(
    accountId: AccountId,
    connectedAccountId: ConnectedAccountId,
  ): Promise<RestoreResult | undefined> {
    const connectedAccount = await connectedAccounts.findForAccount({
      accountId,
      connectedAccountId,
    });
    if (connectedAccount?.status !== 'active') return { outcome: 'needs-sign-in' };
    if (await calmSessions.findOpenFor(connectedAccountId)) return { outcome: 'calm-mode-on' };
    return undefined;
  }

  /** Whether Restore all can start for this connected account. */
  async function canRestoreAll({
    accountId,
    connectedAccountId,
  }: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
  }): Promise<'yes' | 'calm-mode-on' | 'needs-sign-in'> {
    const connectedAccount = await connectedAccounts.findForAccount({
      accountId,
      connectedAccountId,
    });
    if (!connectedAccount) throw new ConnectedAccountNotFoundError();
    const blocked = await checkCanRestore(accountId, connectedAccountId);
    return blocked?.outcome === 'calm-mode-on' || blocked?.outcome === 'needs-sign-in'
      ? blocked.outcome
      : 'yes';
  }

  return { restore, restoreAll, keepHidden, deleteForGood, canRestoreAll };
}
