import { isInCalmPeriod } from '@calm-guardian/shared';

import type { PlatformPost, PlatformPosts, PostsPage, PostUri } from '../calm/platform-posts';
import type { ConnectedAccountId } from '../connections/connected-account';

/** Bluesky's largest page for listing records. */
const DEFAULT_PAGE_SIZE = 100;

let postNumber = 0;

/** A post made at the given time, with a unique URI. */
export function aPost(createdAt: string): PlatformPost {
  postNumber += 1;
  return {
    uri: `at://did:plc:test/app.bsky.feed.post/${postNumber}` as PostUri,
    cid: `cid-${postNumber}`,
    createdAt: new Date(createdAt),
    record: { $type: 'app.bsky.feed.post', text: `Post ${postNumber}`, createdAt },
  };
}

/**
 * An in-memory Platform. Lists newest first, a page at a time, like Bluesky. It can be told to fail,
 * and it writes what it does to `operations` so tests can check the order of backups and deletes.
 */
export class FakePlatformPosts implements PlatformPosts {
  private readonly posts = new Map<ConnectedAccountId, PlatformPost[]>();
  private readonly undeletable = new Set<PostUri>();
  private listingFails = false;

  constructor(
    private readonly operations: string[] = [],
    private readonly pageSize = DEFAULT_PAGE_SIZE,
  ) {}

  publish(connectedAccountId: ConnectedAccountId, ...posts: PlatformPost[]) {
    this.posts.set(connectedAccountId, [...this.postsOf(connectedAccountId), ...posts]);
  }

  /** What's still visible on the Platform. */
  visibleUris(connectedAccountId: ConnectedAccountId): PostUri[] {
    return this.postsOf(connectedAccountId).map((post) => post.uri);
  }

  failToDelete(uri: PostUri) {
    this.undeletable.add(uri);
  }

  failToList() {
    this.listingFails = true;
  }

  listPosts({ connectedAccount, period, cursor }: Parameters<PlatformPosts['listPosts']>[0]) {
    if (this.listingFails) return Promise.reject(new Error('Platform unavailable'));

    const matching = this.postsOf(connectedAccount.id)
      .filter((post) => isInCalmPeriod(period, post.createdAt))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = cursor === undefined ? 0 : Number(cursor);
    const end = start + this.pageSize;
    const page: PostsPage = {
      posts: matching.slice(start, end),
      ...(end < matching.length ? { nextCursor: String(end) } : {}),
    };
    this.operations.push(`list ${page.posts.length}`);
    return Promise.resolve(page);
  }

  deletePost({ connectedAccount, post }: Parameters<PlatformPosts['deletePost']>[0]) {
    if (this.undeletable.has(post.uri)) return Promise.reject(new Error('Delete refused'));

    this.posts.set(
      connectedAccount.id,
      this.postsOf(connectedAccount.id).filter((visible) => visible.uri !== post.uri),
    );
    this.operations.push(`delete ${post.uri}`);
    return Promise.resolve();
  }

  private postsOf(connectedAccountId: ConnectedAccountId) {
    return this.posts.get(connectedAccountId) ?? [];
  }
}
