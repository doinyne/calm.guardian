import { Agent } from '@atproto/api';
import { jsonToLex, lexToJson, type LexValue } from '@atproto/lexicon';
import { ResponseType, XRPCError } from '@atproto/xrpc';
import type { OAuthSession } from '@atproto/oauth-client-node';

import { asRateLimit } from './atproto-rate-limit';
import type { BlueskyRepo } from './bluesky-repo';

const POST_COLLECTION = 'app.bsky.feed.post';

/**
 * The account's repository through `@atproto/api`, signed in with its OAuth session. Kept thin: the
 * logic lives in `bluesky-posts.ts`, where it's tested.
 *
 * The library hands records back with files as objects (CIDs, BlobRefs). `lexToJson` turns them into
 * the plain JSON Bluesky stores, so the Archive keeps exactly what Restore must send back.
 */
export function createAtprotoBlueskyRepo(
  session: OAuthSession,
  now: () => Date = () => new Date(),
): BlueskyRepo {
  const agent = new Agent(session);
  const repo = session.did;

  /** Bluesky's "slow down" becomes a wait (ADR-0015); every other error passes through. */
  const call = async <Result>(request: () => Promise<Result>): Promise<Result> => {
    try {
      return await request();
    } catch (error) {
      throw asRateLimit(error, now());
    }
  };

  return {
    async listPostRecords({ limit, cursor }) {
      const { data } = await call(() =>
        agent.com.atproto.repo.listRecords({
          repo,
          collection: POST_COLLECTION,
          limit,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      );
      return {
        records: data.records.map(({ uri, cid, value }) => ({
          uri,
          cid,
          value: lexToJson(value as LexValue),
        })),
        ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      };
    },

    // Bluesky's servers treat deleting a record that's already gone as done, so retries are safe.
    async deletePostRecord(rkey) {
      await call(() =>
        agent.com.atproto.repo.deleteRecord({ repo, collection: POST_COLLECTION, rkey }),
      );
    },

    async uploadBlob(bytes, mimeType) {
      await call(() => agent.com.atproto.repo.uploadBlob(bytes, { encoding: mimeType }));
    },

    async hasPostRecord(rkey) {
      try {
        await call(() =>
          agent.com.atproto.repo.getRecord({ repo, collection: POST_COLLECTION, rkey }),
        );
        return true;
      } catch (error) {
        if (isRecordNotFound(error)) return false;
        throw error;
      }
    },

    // `jsonToLex` turns the stored plain JSON back into the library's types (CIDs, blob refs), so the
    // record Bluesky stores is byte-for-byte the one we backed up.
    async createPostRecord(rkey, record) {
      await call(() =>
        agent.com.atproto.repo.createRecord({
          repo,
          collection: POST_COLLECTION,
          rkey,
          record: jsonToLex(record) as Record<string, unknown>,
        }),
      );
    },

    async getBlob(cid) {
      const { data } = await call(() => agent.com.atproto.sync.getBlob({ did: repo, cid }));
      return data;
    },
  };
}

/** Bluesky answers a missing record with 400 RecordNotFound. */
function isRecordNotFound(error: unknown) {
  return (
    error instanceof XRPCError &&
    error.status === ResponseType.InvalidRequest &&
    error.error === 'RecordNotFound'
  );
}
