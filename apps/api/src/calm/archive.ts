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
