import { isInCalmPeriod } from '@calm-guardian/shared';
import { z } from 'zod';

import type { MediaRef, PlatformPost, PlatformPosts, PostUri } from '../calm/platform-posts';
import type { ConnectedAccount } from '../connections/connected-account';
import type { Logger } from '../logger';
import type { BlueskyRepoFor, RepoRecord } from './bluesky-repo';

/** Posts and replies. Reposts and likes are other collections, which Calm Mode leaves alone. */
const POST_COLLECTION = 'app.bsky.feed.post';

/** The most records Bluesky returns in one page. */
const PAGE_SIZE = 100;

const AT_URI = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;

const PostValueSchema = z.looseObject({
  $type: z.literal(POST_COLLECTION),
  createdAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
});

const BlobSchema = z.object({
  $type: z.literal('blob'),
  ref: z.object({ $link: z.string().min(1) }),
  mimeType: z.string().min(1),
});

export class NotThisAccountsPostError extends Error {
  override name = 'NotThisAccountsPostError';

  constructor() {
    super("Refusing: that is not one of this account's posts");
  }
}

/**
 * Bluesky as a Platform for Calm Mode. The one place Bluesky's records become our posts (Law of
 * Demeter): nothing outside this file knows what a Bluesky record looks like.
 */
export function createBlueskyPosts({
  repoFor,
  logger,
}: {
  repoFor: BlueskyRepoFor;
  logger: Logger;
}): PlatformPosts {
  return {
    // Bluesky's cursor is the last record key returned, not a position, so Calm Mode can delete posts
    // between pages without the next page skipping any.
    async listPosts({ connectedAccount, period, cursor }) {
      const repo = await repoFor(connectedAccount.externalId);
      const page = await repo.listPostRecords({
        limit: PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor }),
      });

      const posts = page.records.flatMap((record) => {
        const post = toPlatformPost(record, connectedAccount);
        return post ? [post] : [];
      });
      const skipped = page.records.length - posts.length;
      if (skipped > 0) {
        logger.warn(
          { connectedAccountId: connectedAccount.id, skipped },
          'Skipped records that are not valid posts',
        );
      }

      // Newest first, so once a whole page is older than the period, the rest are too. (Posts carry
      // the time the app says they were made, so one backdated post can't stop the search early.)
      const pageIsOlderThanPeriod =
        period.from !== null &&
        posts.length > 0 &&
        posts.every((post) => period.from !== null && post.createdAt < period.from);

      return {
        posts: posts.filter((post) => isInCalmPeriod(period, post.createdAt)),
        ...(page.cursor !== undefined && !pageIsOlderThanPeriod ? { nextCursor: page.cursor } : {}),
      };
    },

    async fetchMedia({ connectedAccount, media }) {
      const repo = await repoFor(connectedAccount.externalId);
      return repo.getBlob(media.cid);
    },

    async uploadMedia({ connectedAccount, media }) {
      const repo = await repoFor(connectedAccount.externalId);
      await repo.uploadBlob(media.bytes, media.mimeType);
    },

    // The same record at the same record key, so the post's address doesn't change and everything
    // that pointed at it reconnects. Checking first makes a retry find it, never duplicate it.
    async restorePost({ connectedAccount, post }) {
      const rkey = ownPostRkey(post.uri, connectedAccount);
      if (!rkey) throw new NotThisAccountsPostError();
      const repo = await repoFor(connectedAccount.externalId);
      if (await repo.hasPostRecord(rkey)) return 'already-there';
      await repo.createPostRecord(rkey, post.record);
      return 'restored';
    },

    async deletePost({ connectedAccount, post }) {
      const rkey = ownPostRkey(post.uri, connectedAccount);
      if (!rkey) throw new NotThisAccountsPostError();
      const repo = await repoFor(connectedAccount.externalId);
      await repo.deletePostRecord(rkey);
    },
  };
}

/** The record key, only if the URI is a post in this account's own repository. */
function ownPostRkey(uri: string, connectedAccount: ConnectedAccount): string | undefined {
  const [, did, collection, rkey] = AT_URI.exec(uri) ?? [];
  return did === connectedAccount.externalId && collection === POST_COLLECTION ? rkey : undefined;
}

function toPlatformPost(
  record: RepoRecord,
  connectedAccount: ConnectedAccount,
): PlatformPost | undefined {
  const value = PostValueSchema.safeParse(record.value);
  if (!value.success || !ownPostRkey(record.uri, connectedAccount)) return undefined;

  return {
    uri: record.uri as PostUri,
    cid: record.cid,
    createdAt: new Date(value.data.createdAt),
    record: value.data,
    media: filesIn(value.data),
  };
}

/**
 * Every file the record refers to, wherever it sits: images, videos, captions, link previews, and
 * those inside a quote. Searching the whole record means new kinds of attachment are backed up too.
 */
function filesIn(value: unknown, found = new Map<string, MediaRef>()): MediaRef[] {
  const file = BlobSchema.safeParse(value);
  if (file.success) {
    found.set(file.data.ref.$link, { cid: file.data.ref.$link, mimeType: file.data.mimeType });
  } else if (Array.isArray(value)) {
    for (const item of value) filesIn(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) filesIn(item, found);
  }
  return [...found.values()];
}
