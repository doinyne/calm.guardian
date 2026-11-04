import { randomUUID } from 'node:crypto';

import type { AccountId } from '../accounts/account-id';
import type {
  Archive,
  ArchivedPostId,
  BackedUpPost,
  MediaCopy,
  ReviewArchive,
  ReviewItem,
  ReviewState,
} from '../calm/archive';
import type { CalmSessionId } from '../calm/calm-session';
import type { PlatformPost } from '../calm/platform-posts';

export type FakeArchivedPost = BackedUpPost & {
  accountId: AccountId;
  calmSessionId: CalmSessionId;
  post: PlatformPost;
  media: readonly MediaCopy[];
  hiddenAt?: Date;
  restoredAt?: Date;
  keptHiddenAt?: Date;
};

/**
 * An in-memory Archive with the real one's rules: one entry per post per connected account, and each
 * `saveAll` stores all of its posts or none. It can be told to fail, and it writes what it does to
 * `operations`.
 */
export class FakeArchive implements Archive, ReviewArchive {
  private readonly entries = new Map<string, FakeArchivedPost>();
  private savesLeft = Infinity;
  private markHiddenFailures = 0;

  constructor(private readonly operations: string[] = []) {}

  /** Every backed-up post, hidden or not. */
  all(): FakeArchivedPost[] {
    return [...this.entries.values()];
  }

  /** Every `save` after this many succeed is rejected. */
  failSavesAfter(successfulSaves: number) {
    this.savesLeft = successfulSaves;
  }

  failNextMarkHidden() {
    this.markHiddenFailures += 1;
  }

  save({
    accountId,
    calmSessionId,
    connectedAccountId,
    post,
    media,
    backedUpAt,
  }: Parameters<Archive['save']>[0]) {
    if (this.savesLeft <= 0) return Promise.reject(new Error('Storage unavailable'));
    this.savesLeft -= 1;

    const key = `${connectedAccountId} ${post.uri}`;
    const backedUp: BackedUpPost = {
      id: this.entries.get(key)?.id ?? (randomUUID() as ArchivedPostId),
      connectedAccountId,
      uri: post.uri,
      backedUpAt,
    };
    this.entries.set(key, { ...backedUp, accountId, calmSessionId, post, media });
    this.operations.push(`back up ${post.uri}`);
    return Promise.resolve(backedUp);
  }

  listNotHidden(calmSessionId: CalmSessionId) {
    return Promise.resolve(
      this.all()
        .filter((entry) => entry.calmSessionId === calmSessionId && !entry.hiddenAt)
        .sort((a, b) => b.post.createdAt.getTime() - a.post.createdAt.getTime())
        .map(({ id, connectedAccountId, uri, backedUpAt }) => ({
          id,
          connectedAccountId,
          uri,
          backedUpAt,
        })),
    );
  }

  markHidden({ archivedPostId, hiddenAt }: Parameters<Archive['markHidden']>[0]) {
    if (this.markHiddenFailures > 0) {
      this.markHiddenFailures -= 1;
      return Promise.reject(new Error('Storage unavailable'));
    }
    const entry = this.all().find((candidate) => candidate.id === archivedPostId);
    if (entry) entry.hiddenAt = hiddenAt;
    return Promise.resolve();
  }

  countHidden(calmSessionId: CalmSessionId) {
    return Promise.resolve(
      this.all().filter(
        (entry) => entry.calmSessionId === calmSessionId && entry.hiddenAt && !entry.restoredAt,
      ).length,
    );
  }

  // Review

  listHidden({ accountId, limit }: Parameters<ReviewArchive['listHidden']>[0]) {
    const hidden = this.all()
      .filter((entry) => entry.accountId === accountId && entry.hiddenAt && !entry.restoredAt)
      .sort(
        (a, b) =>
          Number(Boolean(a.keptHiddenAt)) - Number(Boolean(b.keptHiddenAt)) ||
          b.post.createdAt.getTime() - a.post.createdAt.getTime(),
      );
    return Promise.resolve({
      items: hidden.slice(0, limit).map(toReviewItem),
      more: hidden.length > limit,
    });
  }

  find({ accountId, archivedPostId }: Parameters<ReviewArchive['find']>[0]) {
    const entry = this.byId(archivedPostId);
    return Promise.resolve(
      entry && entry.accountId === accountId && entry.hiddenAt
        ? { ...toReviewItem(entry), media: [...entry.media] }
        : undefined,
    );
  }

  listToRestore({ connectedAccountId, limit }: Parameters<ReviewArchive['listToRestore']>[0]) {
    return Promise.resolve(
      this.all()
        .filter(
          (entry) =>
            entry.connectedAccountId === connectedAccountId &&
            entry.hiddenAt &&
            !entry.restoredAt &&
            !entry.keptHiddenAt,
        )
        .sort((a, b) => a.post.createdAt.getTime() - b.post.createdAt.getTime())
        .slice(0, limit)
        .map((entry) => entry.id),
    );
  }

  markRestored({ archivedPostId, restoredAt }: Parameters<ReviewArchive['markRestored']>[0]) {
    const entry = this.byId(archivedPostId);
    if (entry) entry.restoredAt = restoredAt;
    this.operations.push(`mark restored ${entry?.uri}`);
    return Promise.resolve();
  }

  markKeptHidden({ archivedPostId, keptAt }: Parameters<ReviewArchive['markKeptHidden']>[0]) {
    const entry = this.byId(archivedPostId);
    if (entry) entry.keptHiddenAt = keptAt;
    return Promise.resolve();
  }

  deleteForGood({ accountId, archivedPostId }: Parameters<ReviewArchive['deleteForGood']>[0]) {
    for (const [key, entry] of this.entries) {
      if (entry.id === archivedPostId && entry.accountId === accountId) this.entries.delete(key);
    }
    return Promise.resolve();
  }

  countToReview(accountId: AccountId) {
    return Promise.resolve(
      this.all().filter(
        (entry) => entry.accountId === accountId && reviewStateOf(entry) === 'to-review',
      ).length,
    );
  }

  private byId(archivedPostId: ArchivedPostId) {
    return this.all().find((entry) => entry.id === archivedPostId);
  }
}

function reviewStateOf(entry: FakeArchivedPost): ReviewState | undefined {
  if (entry.restoredAt) return 'restored';
  if (!entry.hiddenAt) return undefined;
  return entry.keptHiddenAt ? 'kept-hidden' : 'to-review';
}

function toReviewItem(entry: FakeArchivedPost): ReviewItem {
  return {
    id: entry.id,
    connectedAccountId: entry.connectedAccountId,
    state: reviewStateOf(entry) ?? 'to-review',
    post: entry.post,
    hiddenAt: entry.hiddenAt ?? entry.backedUpAt,
  };
}
