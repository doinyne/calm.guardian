import type { CalmPeriod } from '@calm-guardian/shared';

import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccount, ConnectedAccountId } from '../connections/connected-account';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import type { GuardianshipId } from '../guardians/guardianship';
import type { Logger } from '../logger';
import type { Archive, BackedUpPost, MediaCopy } from './archive';
import type { CalmSession, CalmSessionFailure, CalmSessionId, CalmSessions } from './calm-session';
import { PlatformRateLimitedError, type PlatformPost, type PlatformPosts } from './platform-posts';

export type CalmModeDependencies = {
  connectedAccounts: Pick<ConnectedAccountsRepository, 'findForAccount' | 'listForAccount'>;
  platformPosts: PlatformPosts;
  archive: Archive;
  calmSessions: CalmSessions;
  now: () => Date;
  logger: Logger;
};

export type StartResult =
  /** A Calm session is activating (new, or one that was already under way). Continue it. */
  | { outcome: 'started'; calmSessionId: CalmSessionId }
  | { outcome: 'already-active'; calmSessionId: CalmSessionId }
  /** The Platform stopped accepting our sign-in, so the user must connect again first. */
  | { outcome: 'needs-sign-in' };

export type ActivationResult =
  /** Calm Mode is on. `stillVisible` posts are backed up but couldn't be deleted. */
  | { outcome: 'active'; calmSessionId: CalmSessionId; hidden: number; stillVisible: number }
  | { outcome: 'already-active'; calmSessionId: CalmSessionId }
  /** Nothing was deleted, and Calm Mode is off. */
  | { outcome: 'failed'; calmSessionId: CalmSessionId; reason: CalmSessionFailure }
  /** Stopped by an error partway. `hidden` posts are hidden and backed up; continuing finishes it. */
  | {
      outcome: 'interrupted';
      calmSessionId: CalmSessionId;
      hidden: number;
      reason: CalmSessionFailure;
    }
  /** Reached its deadline. Continue it straight away. */
  | { outcome: 'in-progress'; calmSessionId: CalmSessionId; hidden: number }
  /** The Platform asked us to slow down. Continue it at `until`. */
  | { outcome: 'waiting'; calmSessionId: CalmSessionId; hidden: number; until: Date }
  | { outcome: 'needs-sign-in' }
  /** The user turned Calm Mode off. Nothing more to do. */
  | { outcome: 'off'; calmSessionId: CalmSessionId };

export type SweepResult =
  /** `hidden`: posts this sweep backed up and hid. */
  | { outcome: 'swept'; calmSessionId: CalmSessionId; hidden: number }
  | { outcome: 'in-progress'; calmSessionId: CalmSessionId }
  | { outcome: 'waiting'; calmSessionId: CalmSessionId; until: Date }
  /** Stopped by an error; the next sweep tries again. */
  | { outcome: 'interrupted'; calmSessionId: CalmSessionId; reason: CalmSessionFailure }
  /** Calm Mode isn't on for this session (still turning on, or turned off). */
  | { outcome: 'not-on'; calmSessionId: CalmSessionId }
  | { outcome: 'needs-sign-in'; calmSessionId: CalmSessionId };

export type TurnOffResult = 'off' | 'already-off' | 'still-activating';

/** How many posts turning Calm Mode on would hide. `more`: there are more than `posts`. */
export type Preview = { posts: number; more: boolean };

/** A connected account and, while Calm Mode is on or turning on, its Calm session. */
export type CalmStatus = {
  connectedAccount: ConnectedAccount;
  calm: {
    calmSessionId: CalmSessionId;
    state: CalmSession['state'];
    period: CalmPeriod;
    startedAt: Date;
    hidden: number;
  } | null;
};

/** Counting stops here, so a preview is quick even for a huge account. */
export const PREVIEW_LIMIT = 1000;

export class ConnectedAccountNotFoundError extends Error {
  override readonly name = 'ConnectedAccountNotFoundError';
}

export class CalmSessionNotFoundError extends Error {
  override readonly name = 'CalmSessionNotFoundError';
}

/** Why a run stopped before finishing. */
type Stop =
  | { kind: 'failure'; reason: CalmSessionFailure }
  | { kind: 'deadline' }
  | { kind: 'rate-limited'; until: Date };

/**
 * Turning Calm Mode on (BUILD_PLAN M2, ADR-0011, ADR-0015): for one connected account, work through the
 * period's posts **newest first**, backing up each post and its files, and deleting it from the
 * Platform as soon as that backup is stored. A post from this morning is hidden in seconds, without
 * waiting for years of older posts. No post is ever deleted before its own backup (product rule 1).
 *
 * `start` opens the Calm session; `continueActivation` does the work, and may stop at a deadline or
 * when the Platform asks us to slow down. The job runner keeps continuing it until it's done. Progress
 * is saved as it goes, so every run picks up where the last one stopped.
 *
 * Safe to retry: backups are keyed by post, hidden posts are no longer listed, and Platforms treat
 * deleting a deleted post as done.
 */
export function createCalmMode({
  connectedAccounts,
  platformPosts,
  archive,
  calmSessions,
  now,
  logger,
}: CalmModeDependencies) {
  async function start({
    accountId,
    connectedAccountId,
    period,
    startedBy,
  }: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
    period: CalmPeriod;
    /** The Guardian turning it on; omitted when the user does. */
    startedBy?: GuardianshipId;
  }): Promise<StartResult> {
    const connectedAccount = await connectedAccounts.findForAccount({
      accountId,
      connectedAccountId,
    });
    if (!connectedAccount) throw new ConnectedAccountNotFoundError();
    return startFor(connectedAccount, period, startedBy);
  }

  async function startFor(
    connectedAccount: ConnectedAccount,
    period: CalmPeriod,
    startedBy?: GuardianshipId,
  ): Promise<StartResult> {
    if (connectedAccount.status !== 'active') return { outcome: 'needs-sign-in' };

    const calmSession = await calmSessions.openFor({
      accountId: connectedAccount.accountId,
      connectedAccountId: connectedAccount.id,
      period,
      startedAt: now(),
      ...(startedBy ? { startedBy } : {}),
    });
    return calmSession.state === 'active'
      ? { outcome: 'already-active', calmSessionId: calmSession.id }
      : { outcome: 'started', calmSessionId: calmSession.id };
  }

  /**
   * Works on an activating Calm session until it's done, or until `deadline` (it always gets through
   * at least one post, so every run makes progress). Safe to call for a session in any state.
   */
  async function continueActivation({
    calmSessionId,
    deadline,
  }: {
    calmSessionId: CalmSessionId;
    deadline?: Date;
  }): Promise<ActivationResult> {
    const calmSession = await calmSessions.find(calmSessionId);
    if (!calmSession) throw new CalmSessionNotFoundError();
    if (calmSession.state === 'active') return { outcome: 'already-active', calmSessionId };
    if (calmSession.state === 'ended') return { outcome: 'off', calmSessionId };
    if (calmSession.state === 'failed') {
      return { outcome: 'failed', calmSessionId, reason: calmSession.failure ?? 'backup-failed' };
    }

    const connectedAccount = await connectedAccounts.findForAccount({
      accountId: calmSession.accountId,
      connectedAccountId: calmSession.connectedAccountId,
    });
    if (connectedAccount?.status !== 'active') return { outcome: 'needs-sign-in' };

    const stopped = await hidePeriodNewestFirst(connectedAccount, calmSession, {
      period: calmSession.period,
      deadline,
      ...(calmSession.resumeCursor === null ? {} : { startCursor: calmSession.resumeCursor }),
      // Saved after each page, so the next run starts here rather than re-listing done pages.
      onPageDone: (nextCursor) =>
        calmSessions.saveProgress({ calmSessionId, resumeCursor: nextCursor ?? null }),
    });
    if (stopped) return stopEarly(calmSession, stopped);
    const retried = await retryBackedUpPosts(connectedAccount, calmSessionId);
    if ('kind' in retried) return stopEarly(calmSession, retried);

    await calmSessions.markActive({ calmSessionId, activatedAt: now() });
    return {
      outcome: 'active',
      calmSessionId,
      hidden: await archive.countHidden(calmSessionId),
      stillVisible: retried.stillVisible,
    };
  }

  /**
   * The Sweep (M4): while Calm Mode is on, backs up and hides posts made since it was turned on, newest
   * first, by the same rules as turning it on. Swept posts join the same Calm session, so they're
   * counted and reviewed with the rest. Runs on a schedule (ADR-0015).
   */
  async function sweep({
    calmSessionId,
    deadline,
  }: {
    calmSessionId: CalmSessionId;
    deadline?: Date;
  }): Promise<SweepResult> {
    const calmSession = await calmSessions.find(calmSessionId);
    if (!calmSession) throw new CalmSessionNotFoundError();
    if (calmSession.state !== 'active') return { outcome: 'not-on', calmSessionId };

    const connectedAccount = await connectedAccounts.findForAccount({
      accountId: calmSession.accountId,
      connectedAccountId: calmSession.connectedAccountId,
    });
    if (connectedAccount?.status !== 'active') return { outcome: 'needs-sign-in', calmSessionId };

    const hiddenBefore = await archive.countHidden(calmSessionId);
    // Everything since the period Calm Mode was turned on for, up to now.
    const stopped =
      (await hidePeriodNewestFirst(connectedAccount, calmSession, {
        period: { from: calmSession.period.to, to: now() },
        deadline,
      })) ?? (await retryBackedUpPosts(connectedAccount, calmSessionId));

    if ('kind' in stopped) {
      switch (stopped.kind) {
        case 'deadline':
          return { outcome: 'in-progress', calmSessionId };
        case 'rate-limited':
          return { outcome: 'waiting', calmSessionId, until: stopped.until };
        case 'failure':
          return { outcome: 'interrupted', calmSessionId, reason: stopped.reason };
      }
    }
    return {
      outcome: 'swept',
      calmSessionId,
      hidden: (await archive.countHidden(calmSessionId)) - hiddenBefore,
    };
  }

  /** Counts the posts turning Calm Mode on would hide, without touching them. */
  async function preview({
    accountId,
    connectedAccountId,
    period,
    limit = PREVIEW_LIMIT,
  }: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
    period: CalmPeriod;
    limit?: number;
  }): Promise<Preview> {
    const connectedAccount = await ownConnectedAccount(accountId, connectedAccountId);
    let posts = 0;
    let cursor: string | undefined;
    do {
      const page = await platformPosts.listPosts({
        connectedAccount,
        period,
        ...(cursor === undefined ? {} : { cursor }),
      });
      posts += page.posts.length;
      if (posts > limit) return { posts: limit, more: true };
      if (posts === limit && page.nextCursor !== undefined) return { posts, more: true };
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return { posts, more: false };
  }

  /**
   * Turns Calm Mode off. Hidden posts stay hidden, safely archived, until the user goes through them
   * in Review. Not while posts are still being hidden (Dean, 2026-11-04).
   */
  async function turnOff({
    accountId,
    connectedAccountId,
  }: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
  }): Promise<TurnOffResult> {
    await ownConnectedAccount(accountId, connectedAccountId);
    const open = await calmSessions.findOpenFor(connectedAccountId);
    if (!open) return 'already-off';
    if (open.state === 'activating') return 'still-activating';
    await calmSessions.end({ calmSessionId: open.id, endedAt: now() });
    return 'off';
  }

  /** Every connected account of the Account, with its open Calm session. The server owns this state. */
  async function status(accountId: AccountId): Promise<CalmStatus[]> {
    const statuses: CalmStatus[] = [];
    for (const connectedAccount of await connectedAccounts.listForAccount(accountId)) {
      const open = await calmSessions.findOpenFor(connectedAccount.id);
      statuses.push({
        connectedAccount,
        calm: open
          ? {
              calmSessionId: open.id,
              state: open.state,
              period: open.period,
              startedAt: open.startedAt,
              hidden: await archive.countHidden(open.id),
            }
          : null,
      });
    }
    return statuses;
  }

  async function ownConnectedAccount(accountId: AccountId, connectedAccountId: ConnectedAccountId) {
    const connectedAccount = await connectedAccounts.findForAccount({
      accountId,
      connectedAccountId,
    });
    if (!connectedAccount) throw new ConnectedAccountNotFoundError();
    return connectedAccount;
  }

  /** Start and finish in one go: for tests and small jobs. The job runner uses the two halves. */
  async function activate(input: Parameters<typeof start>[0]): Promise<ActivationResult> {
    const started = await start(input);
    return started.outcome === 'started'
      ? continueActivation({ calmSessionId: started.calmSessionId })
      : started;
  }

  /** "Turn on for all": each connected account gets its own Calm session, whatever happens to the others. */
  async function activateAll({ accountId, period }: { accountId: AccountId; period: CalmPeriod }) {
    const results: { connectedAccountId: ConnectedAccountId; result: ActivationResult }[] = [];
    for (const connectedAccount of await connectedAccounts.listForAccount(accountId)) {
      const started = await startFor(connectedAccount, period);
      results.push({
        connectedAccountId: connectedAccount.id,
        result:
          started.outcome === 'started'
            ? await continueActivation({ calmSessionId: started.calmSessionId })
            : started,
      });
    }
    return results;
  }

  /**
   * Stopping before anything is hidden because of an error means Calm Mode stays off and nothing
   * changed. Otherwise the hidden posts stay hidden and the session stays open to be continued.
   */
  async function stopEarly(calmSession: CalmSession, stop: Stop): Promise<ActivationResult> {
    const calmSessionId = calmSession.id;
    const hidden = await archive.countHidden(calmSessionId);
    switch (stop.kind) {
      case 'deadline':
        return { outcome: 'in-progress', calmSessionId, hidden };
      case 'rate-limited':
        return { outcome: 'waiting', calmSessionId, hidden, until: stop.until };
      case 'failure':
        if (hidden > 0) {
          return { outcome: 'interrupted', calmSessionId, hidden, reason: stop.reason };
        }
        await calmSessions.markFailed({ calmSessionId, reason: stop.reason, failedAt: now() });
        return { outcome: 'failed', calmSessionId, reason: stop.reason };
    }
  }

  /**
   * Page by page, newest first, from where the last run stopped: back up each post with its files,
   * then delete it straight away. A delete that fails doesn't stop it: that post stays visible and
   * backed up, and is tried again at the end.
   */
  async function hidePeriodNewestFirst(
    connectedAccount: ConnectedAccount,
    calmSession: CalmSession,
    {
      period,
      deadline,
      startCursor,
      onPageDone,
    }: {
      period: CalmPeriod;
      deadline: Date | undefined;
      startCursor?: string;
      /** Called with the next page's cursor, to save the place for the next run. */
      onPageDone?: (nextCursor: string | undefined) => Promise<void>;
    },
  ): Promise<Stop | undefined> {
    let cursor = startCursor;
    let postsThisRun = 0;
    // Posts this session has backed up but couldn't hide. They get one retry at the end, so a post the
    // Platform won't delete can't take up the start of every run.
    const alreadyTried = new Set(
      (await archive.listNotHidden(calmSession.id)).map((post) => post.uri),
    );
    do {
      let page;
      try {
        page = await platformPosts.listPosts({
          connectedAccount,
          period,
          ...(cursor === undefined ? {} : { cursor }),
        });
      } catch (error) {
        return stopFor(error, calmSession.id, 'could-not-read-posts', 'Could not list posts');
      }

      for (const post of page.posts) {
        if (alreadyTried.has(post.uri)) continue;
        if (deadline && postsThisRun > 0 && now() >= deadline) return { kind: 'deadline' };
        postsThisRun += 1;

        const backup = await backUp(connectedAccount, calmSession, post);
        if ('kind' in backup) return backup;
        const hidden = await hide(connectedAccount, calmSession.id, backup);
        if (typeof hidden === 'object') return hidden;
        if (hidden === 'still-visible') alreadyTried.add(post.uri);
      }

      cursor = page.nextCursor;
      await onPageDone?.(cursor);
    } while (cursor !== undefined);
    return undefined;
  }

  /** Stores the post and copies of its files. Only what this returns can be deleted. */
  async function backUp(
    connectedAccount: ConnectedAccount,
    calmSession: CalmSession,
    post: PlatformPost,
  ): Promise<BackedUpPost | Stop> {
    let media;
    try {
      media = await copyMedia(connectedAccount, post);
    } catch (error) {
      return stopFor(
        error,
        calmSession.id,
        'could-not-read-posts',
        "Could not fetch a post's files",
      );
    }

    try {
      return await archive.save({
        accountId: connectedAccount.accountId,
        calmSessionId: calmSession.id,
        connectedAccountId: connectedAccount.id,
        post,
        media,
        backedUpAt: now(),
      });
    } catch (error) {
      return stopFor(error, calmSession.id, 'backup-failed', 'Could not back up a post');
    }
  }

  /**
   * Deletes a backed-up post and records it as hidden. A refused delete leaves the post visible and
   * is reported; being asked to slow down stops the run.
   */
  async function hide(
    connectedAccount: ConnectedAccount,
    calmSessionId: CalmSessionId,
    post: BackedUpPost,
  ): Promise<'hidden' | 'still-visible' | Stop> {
    try {
      await platformPosts.deletePost({ connectedAccount, post });
    } catch (error) {
      if (error instanceof PlatformRateLimitedError) {
        return { kind: 'rate-limited', until: error.retryAt };
      }
      logger.warn(
        { calmSessionId, archivedPostId: post.id, errorName: errorName(error) },
        'Could not delete a backed-up post; it is still visible',
      );
      return 'still-visible';
    }
    await archive.markHidden({ archivedPostId: post.id, hiddenAt: now() });
    return 'hidden';
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
   * One more try at whatever the session has backed up but not hidden: a delete that failed, or one
   * that worked just before an earlier run was interrupted. What's left is reported as still visible.
   */
  async function retryBackedUpPosts(
    connectedAccount: ConnectedAccount,
    calmSessionId: CalmSessionId,
  ): Promise<{ stillVisible: number } | Stop> {
    let stillVisible = 0;
    for (const post of await archive.listNotHidden(calmSessionId)) {
      const hidden = await hide(connectedAccount, calmSessionId, post);
      if (typeof hidden === 'object') return hidden;
      if (hidden === 'still-visible') stillVisible += 1;
    }
    return { stillVisible };
  }

  /** A Platform asking us to slow down is a wait, not a failure. Anything else is logged by name. */
  function stopFor(
    error: unknown,
    calmSessionId: CalmSessionId,
    reason: CalmSessionFailure,
    message: string,
  ): Stop {
    if (error instanceof PlatformRateLimitedError)
      return { kind: 'rate-limited', until: error.retryAt };
    logger.warn({ calmSessionId, errorName: errorName(error) }, `${message}; stopped`);
    return { kind: 'failure', reason };
  }

  return { start, continueActivation, activate, activateAll, preview, turnOff, status, sweep };
}

/** Error details can carry post text or tokens, so logs only ever get the error's name. */
function errorName(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}
