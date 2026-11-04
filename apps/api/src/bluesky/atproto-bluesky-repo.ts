import { Agent } from '@atproto/api';
import { lexToJson, type LexValue } from '@atproto/lexicon';
import type { OAuthSession } from '@atproto/oauth-client-node';

import type { BlueskyRepo } from './bluesky-repo';

const POST_COLLECTION = 'app.bsky.feed.post';

/**
 * The account's repository through `@atproto/api`, signed in with its OAuth session. Kept thin: the
 * logic lives in `bluesky-posts.ts`, where it's tested.
 *
 * The library hands records back with files as objects (CIDs, BlobRefs). `lexToJson` turns them into
 * the plain JSON Bluesky stores, so the Archive keeps exactly what Restore must send back.
 */
export function createAtprotoBlueskyRepo(session: OAuthSession): BlueskyRepo {
  const agent = new Agent(session);
  const repo = session.did;

  return {
    async listPostRecords({ limit, cursor }) {
      const { data } = await agent.com.atproto.repo.listRecords({
        repo,
        collection: POST_COLLECTION,
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      });
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
      await agent.com.atproto.repo.deleteRecord({ repo, collection: POST_COLLECTION, rkey });
    },

    async getBlob(cid) {
      const { data } = await agent.com.atproto.sync.getBlob({ did: repo, cid });
      return data;
    },
  };
}
