import type { CalmPeriod } from '@calm-guardian/shared';

import type { ConnectedAccount } from '../connections/connected-account';
import type { BackedUpPost } from './archive';

/** A post's permanent address on its Platform (an `at://` URI on Bluesky). */
export type PostUri = string & { readonly __brand: 'PostUri' };

/** A post as its Platform holds it, mapped to our shape by the Platform adapter. */
export type PlatformPost = {
  uri: PostUri;
  /** The Platform's content hash for this version of the post. */
  cid: string;
  createdAt: Date;
  /** The whole record as the Platform stores it, so Restore can re-create it faithfully. */
  record: Readonly<Record<string, unknown>>;
};

export type PostsPage = { posts: readonly PlatformPost[]; nextCursor?: string };

/** What Calm Mode needs from a Platform (the Platform adapter's port). */
export interface PlatformPosts {
  /**
   * The account's own posts and replies made within the period, a page at a time. No `nextCursor`
   * means there are no more. Reposts and likes aren't posts.
   */
  listPosts(input: {
    connectedAccount: ConnectedAccount;
    period: CalmPeriod;
    cursor?: string;
  }): Promise<PostsPage>;

  /**
   * Removes the post from the Platform. Takes only a post we've backed up (product rule 1).
   * Resolves once the post is gone, including when it was already gone, so retrying is safe.
   */
  deletePost(input: { connectedAccount: ConnectedAccount; post: BackedUpPost }): Promise<void>;
}
