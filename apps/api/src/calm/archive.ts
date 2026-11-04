import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccountId } from '../connections/connected-account';
import type { CalmSessionId } from './calm-session';
import type { MediaRef, PlatformPost, PostUri } from './platform-posts';

export type ArchivedPostId = string & { readonly __brand: 'ArchivedPostId' };

/**
 * A post whose backup is confirmed stored. Only the Archive hands these out, and only a
 * `BackedUpPost` can be deleted from its Platform (product rule 1).
 */
export type BackedUpPost = {
  id: ArchivedPostId;
  connectedAccountId: ConnectedAccountId;
  uri: PostUri;
  backedUpAt: Date;
};

/** A copy of one of a post's files. */
export type MediaCopy = MediaRef & { bytes: Uint8Array };

/** The backed-up posts (the Archive repository's port). */
export interface Archive {
  /**
   * Backs up a post in full, with copies of its files, for this Calm session. Resolves, with the
   * post as deletable, only once the post and every file are stored, and rejects otherwise. Retry-safe: each post is held once per
   * connected account (keyed by its URI), so backing it up again updates it rather than adding another.
   */
  save(input: {
    accountId: AccountId;
    calmSessionId: CalmSessionId;
    connectedAccountId: ConnectedAccountId;
    post: PlatformPost;
    media: readonly MediaCopy[];
    backedUpAt: Date;
  }): Promise<BackedUpPost>;

  /** The session's posts that are backed up but not yet hidden, newest first. */
  listNotHidden(calmSessionId: CalmSessionId): Promise<BackedUpPost[]>;

  /** Records that the post is gone from its Platform. */
  markHidden(input: { archivedPostId: ArchivedPostId; hiddenAt: Date }): Promise<void>;

  countHidden(calmSessionId: CalmSessionId): Promise<number>;
}

/**
 * Where a hidden post stands in Review:
 * - `to-review`: hidden, and the user hasn't decided yet
 * - `kept-hidden`: the user chose to keep it hidden (it can still be restored later)
 * - `restored`: back on its Platform
 */
export type ReviewState = 'to-review' | 'kept-hidden' | 'restored';

/** A backed-up post as Review shows it, decrypted. */
export type ReviewItem = {
  id: ArchivedPostId;
  connectedAccountId: ConnectedAccountId;
  state: ReviewState;
  post: PlatformPost;
  hiddenAt: Date;
};

/** The Archive as Review and Restore use it. Everything is scoped to the Account that owns it. */
export interface ReviewArchive {
  /** Posts still hidden (to review first, then kept hidden), newest first. */
  listHidden(input: {
    accountId: AccountId;
    limit: number;
  }): Promise<{ items: ReviewItem[]; more: boolean }>;

  /** One of the Account's backed-up posts, with copies of its files. */
  find(input: {
    accountId: AccountId;
    archivedPostId: ArchivedPostId;
  }): Promise<(ReviewItem & { media: MediaCopy[] }) | undefined>;

  /** The connected account's hidden posts that aren't kept hidden, oldest first: Restore all's queue. */
  listToRestore(input: {
    connectedAccountId: ConnectedAccountId;
    limit: number;
  }): Promise<ArchivedPostId[]>;

  markRestored(input: { archivedPostId: ArchivedPostId; restoredAt: Date }): Promise<void>;

  markKeptHidden(input: { archivedPostId: ArchivedPostId; keptAt: Date }): Promise<void>;

  /** Deletes our copy for good: the post and its files. It can never be restored. */
  deleteForGood(input: { accountId: AccountId; archivedPostId: ArchivedPostId }): Promise<void>;

  /** Whether the Account has posts still to review. ADR-0011: Guardians wait until there are none. */
  countToReview(accountId: AccountId): Promise<number>;
}
