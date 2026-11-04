import type { ExternalAccountId } from '../connections/connected-account';

/**
 * A record as the account's server returns it, in plain JSON (files appear as
 * `{"$type": "blob", "ref": {"$link": cid}, ...}`). Not trusted: `bluesky-posts.ts` checks it.
 */
export type RepoRecord = { uri: string; cid: string; value: unknown };

export type RepoPage = { records: readonly RepoRecord[]; cursor?: string };

/** The few calls Calm Mode makes to a Bluesky account's repository, signed in as that account. */
export interface BlueskyRepo {
  /** The account's posts and replies, newest first. */
  listPostRecords(input: { limit: number; cursor?: string }): Promise<RepoPage>;
  /** Deleting a post that's already gone succeeds. */
  deletePostRecord(rkey: string): Promise<void>;
  getBlob(cid: string): Promise<Uint8Array>;
}

/** Signs in as the account, using its stored OAuth session. */
export type BlueskyRepoFor = (did: ExternalAccountId) => Promise<BlueskyRepo>;
