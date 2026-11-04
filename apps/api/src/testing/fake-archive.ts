import { randomUUID } from 'node:crypto';

import type { Archive, ArchivedPostId, BackedUpPost } from '../calm/archive';
import type { CalmSessionId } from '../calm/calm-session';
import type { PlatformPost } from '../calm/platform-posts';

export type FakeArchivedPost = BackedUpPost & {
  calmSessionId: CalmSessionId;
  post: PlatformPost;
  hiddenAt?: Date;
};

/**
 * An in-memory Archive with the real one's rules: one entry per post per connected account, and each
 * `saveAll` stores all of its posts or none. It can be told to fail, and it writes what it does to
 * `operations`.
 */
export class FakeArchive implements Archive {
  private readonly entries = new Map<string, FakeArchivedPost>();
  private savesLeft = Infinity;
  private markHiddenFailures = 0;

  constructor(private readonly operations: string[] = []) {}

  /** Every backed-up post, hidden or not. */
  all(): FakeArchivedPost[] {
    return [...this.entries.values()];
  }

  /** The next `saveAll` calls after this many succeed are rejected. */
  failSavesAfter(successfulSaves: number) {
    this.savesLeft = successfulSaves;
  }

  failNextMarkHidden() {
    this.markHiddenFailures += 1;
  }

  saveAll({
    calmSessionId,
    connectedAccountId,
    posts,
    backedUpAt,
  }: Parameters<Archive['saveAll']>[0]) {
    if (this.savesLeft <= 0) return Promise.reject(new Error('Storage unavailable'));
    this.savesLeft -= 1;

    for (const post of posts) {
      const key = `${connectedAccountId} ${post.uri}`;
      const existing = this.entries.get(key);
      this.entries.set(key, {
        id: existing?.id ?? (randomUUID() as ArchivedPostId),
        connectedAccountId,
        uri: post.uri,
        backedUpAt,
        calmSessionId,
        post,
      });
      this.operations.push(`back up ${post.uri}`);
    }
    return Promise.resolve();
  }

  listNotHidden(calmSessionId: CalmSessionId) {
    return Promise.resolve(
      this.all()
        .filter((entry) => entry.calmSessionId === calmSessionId && !entry.hiddenAt)
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
      this.all().filter((entry) => entry.calmSessionId === calmSessionId && entry.hiddenAt).length,
    );
  }
}
