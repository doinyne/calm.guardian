import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccountId } from '../connections/connected-account';
import type { CalmSessionId } from './calm-session';
import type { PlatformPost, PostUri } from './platform-posts';

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

/** The backed-up posts (the Archive repository's port). */
export interface Archive {
  /**
   * Backs up each post in full for this Calm session. Resolves only once every post is stored, and
   * rejects if any isn't. Retry-safe: each post is held once per connected account (keyed by its URI),
   * so backing it up again updates it rather than adding another.
   */
  saveAll(input: {
    accountId: AccountId;
    calmSessionId: CalmSessionId;
    connectedAccountId: ConnectedAccountId;
    posts: readonly PlatformPost[];
    backedUpAt: Date;
  }): Promise<void>;

  /** The session's posts that are backed up but not yet hidden. */
  listNotHidden(calmSessionId: CalmSessionId): Promise<BackedUpPost[]>;

  /** Records that the post is gone from its Platform. */
  markHidden(input: { archivedPostId: ArchivedPostId; hiddenAt: Date }): Promise<void>;

  countHidden(calmSessionId: CalmSessionId): Promise<number>;
}
