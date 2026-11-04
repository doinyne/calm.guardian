import { presetCalmPeriod } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

import type { BackedUpPost, ArchivedPostId } from '../calm/archive';
import type { PostUri } from '../calm/platform-posts';
import type {
  ConnectedAccount,
  ConnectedAccountId,
  ExternalAccountId,
} from '../connections/connected-account';
import type { AccountId } from '../accounts/account-id';
import { captureLogs } from '../testing/log-capture';
import { createBlueskyPosts } from './bluesky-posts';
import type { BlueskyRepo, RepoRecord } from './bluesky-repo';

const DID = 'did:plc:dean' as ExternalAccountId;
const NOW = new Date('2026-11-04T12:00:00.000Z');
const LAST_7_DAYS = presetCalmPeriod('last-7-days', NOW);
const EVERYTHING = presetCalmPeriod('everything', NOW);

const CONNECTED: ConnectedAccount = {
  id: '0b6c1e7a-4f2d-4a8e-9b3c-7d1e2f3a4b5c' as ConnectedAccountId,
  accountId: '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId,
  platform: 'bluesky',
  externalId: DID,
  handle: 'dean.bsky.social',
  status: 'active',
  connectedAt: NOW,
};

const blob = (cid: string, mimeType = 'image/jpeg') => ({
  $type: 'blob',
  ref: { $link: cid },
  mimeType,
  size: 1234,
});

let rkeyNumber = 0;

/** A post record as Bluesky returns it. */
function postRecord(createdAt: string, extra: Record<string, unknown> = {}): RepoRecord {
  rkeyNumber += 1;
  return {
    uri: `at://${DID}/app.bsky.feed.post/3k${rkeyNumber}`,
    cid: `bafyrecord${rkeyNumber}`,
    value: { $type: 'app.bsky.feed.post', text: `Post ${rkeyNumber}`, createdAt, ...extra },
  };
}

/** One account's repository, newest first, `pageSize` records a page. */
class FakeBlueskyRepo implements BlueskyRepo {
  readonly deleted: string[] = [];
  readonly pagesRequested: (string | undefined)[] = [];

  constructor(
    private readonly records: RepoRecord[],
    private readonly pageSize = 100,
  ) {}

  listPostRecords({ cursor }: { limit: number; cursor?: string }) {
    this.pagesRequested.push(cursor);
    const start = cursor === undefined ? 0 : Number(cursor);
    const end = start + this.pageSize;
    return Promise.resolve({
      records: this.records.slice(start, end),
      ...(end < this.records.length ? { cursor: String(end) } : {}),
    });
  }

  deletePostRecord(rkey: string) {
    this.deleted.push(rkey);
    return Promise.resolve();
  }

  getBlob(cid: string) {
    return Promise.resolve(new Uint8Array(Buffer.from(`blob ${cid}`)));
  }

  readonly uploaded: string[] = [];
  readonly created: { rkey: string; record: unknown }[] = [];
  readonly existing = new Set<string>();

  uploadBlob(bytes: Uint8Array, mimeType: string) {
    this.uploaded.push(`${mimeType} ${Buffer.from(bytes).toString()}`);
    return Promise.resolve();
  }

  hasPostRecord(rkey: string) {
    return Promise.resolve(this.existing.has(rkey));
  }

  createPostRecord(rkey: string, record: Readonly<Record<string, unknown>>) {
    this.created.push({ rkey, record });
    this.existing.add(rkey);
    return Promise.resolve();
  }
}

function setUp(records: RepoRecord[], pageSize?: number) {
  const repo = new FakeBlueskyRepo(records, pageSize);
  const logs = captureLogs();
  const posts = createBlueskyPosts({
    repoFor: (did) =>
      did === DID ? Promise.resolve(repo) : Promise.reject(new Error(`no session for ${did}`)),
    logger: logs.logger,
  });
  return { posts, repo, logs };
}

/** Every post listed for the period, following the cursor like Calm Mode does. */
async function listAll(posts: ReturnType<typeof createBlueskyPosts>, period = LAST_7_DAYS) {
  const listed = [];
  let cursor: string | undefined;
  do {
    const page = await posts.listPosts({
      connectedAccount: CONNECTED,
      period,
      ...(cursor === undefined ? {} : { cursor }),
    });
    listed.push(...page.posts);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return listed;
}

const backedUp = (uri: string): BackedUpPost => ({
  id: 'b1d2c3e4-0000-4000-8000-000000000001' as ArchivedPostId,
  connectedAccountId: CONNECTED.id,
  uri: uri as PostUri,
  backedUpAt: NOW,
});

describe('Bluesky posts', () => {
  describe('listing', () => {
    it('maps each post, keeping the whole record for Restore', async () => {
      const record = postRecord('2026-11-04T09:00:00.000Z', { langs: ['en'] });
      const { posts } = setUp([record]);

      expect(await listAll(posts)).toEqual([
        {
          uri: record.uri,
          cid: record.cid,
          createdAt: new Date('2026-11-04T09:00:00.000Z'),
          record: record.value,
          media: [],
        },
      ]);
    });

    it('finds every file a post uses: images, video and captions, quoted media, link previews', async () => {
      const { posts } = setUp([
        postRecord('2026-11-04T09:00:00.000Z', {
          embed: {
            $type: 'app.bsky.embed.images',
            images: [
              { image: blob('bafkimage1'), alt: '' },
              { image: blob('bafkimage2', 'image/png'), alt: '' },
            ],
          },
        }),
        postRecord('2026-11-04T08:00:00.000Z', {
          embed: {
            $type: 'app.bsky.embed.video',
            video: blob('bafkvideo', 'video/mp4'),
            captions: [{ lang: 'en', file: blob('bafkcaptions', 'text/vtt') }],
          },
        }),
        postRecord('2026-11-04T07:00:00.000Z', {
          embed: {
            $type: 'app.bsky.embed.recordWithMedia',
            record: { record: { uri: 'at://did:plc:other/app.bsky.feed.post/1', cid: 'bafyq' } },
            media: { $type: 'app.bsky.embed.images', images: [{ image: blob('bafkquoted') }] },
          },
        }),
        postRecord('2026-11-04T06:00:00.000Z', {
          embed: {
            $type: 'app.bsky.embed.external',
            external: { uri: 'https://example.com', title: '', thumb: blob('bafkthumb') },
          },
        }),
      ]);

      const media = (await listAll(posts)).map((post) => post.media);

      expect(media).toEqual([
        [
          { cid: 'bafkimage1', mimeType: 'image/jpeg' },
          { cid: 'bafkimage2', mimeType: 'image/png' },
        ],
        [
          { cid: 'bafkvideo', mimeType: 'video/mp4' },
          { cid: 'bafkcaptions', mimeType: 'text/vtt' },
        ],
        [{ cid: 'bafkquoted', mimeType: 'image/jpeg' }],
        [{ cid: 'bafkthumb', mimeType: 'image/jpeg' }],
      ]);
    });

    it('lists only posts made within the period', async () => {
      const inside = postRecord('2026-11-01T09:00:00.000Z');
      const { posts } = setUp([
        postRecord('2026-11-05T09:00:00.000Z'), // after the period ends
        inside,
        postRecord('2026-10-01T09:00:00.000Z'), // before it starts
      ]);

      expect((await listAll(posts)).map((post) => post.uri)).toEqual([inside.uri]);
    });

    it('follows the pages, and stops once a whole page is older than the period', async () => {
      const { posts, repo } = setUp(
        [
          postRecord('2026-11-04T09:00:00.000Z'),
          postRecord('2026-11-03T09:00:00.000Z'),
          postRecord('2026-11-02T09:00:00.000Z'),
          postRecord('2026-10-20T09:00:00.000Z'),
          postRecord('2026-10-19T09:00:00.000Z'),
          postRecord('2026-10-18T09:00:00.000Z'),
          postRecord('2026-10-17T09:00:00.000Z'),
        ],
        2,
      );

      expect(await listAll(posts)).toHaveLength(3);
      expect(repo.pagesRequested).toEqual([undefined, '2', '4']);
    });

    it('reads every page for everything', async () => {
      const records = Array.from({ length: 250 }, (_, index) =>
        postRecord(new Date(NOW.getTime() - (index + 1) * 86_400_000).toISOString()),
      );
      const { posts } = setUp(records);

      expect(await listAll(posts, EVERYTHING)).toHaveLength(250);
    });

    it("skips records that aren't this account's posts, without logging their content", async () => {
      const good = postRecord('2026-11-04T09:00:00.000Z');
      const { posts, logs } = setUp([
        { uri: `at://${DID}/app.bsky.feed.post/bad`, cid: 'bafybad', value: { text: 'secret' } },
        {
          ...postRecord('2026-11-04T08:00:00.000Z'),
          uri: 'at://did:plc:other/app.bsky.feed.post/1',
        },
        good,
      ]);

      expect((await listAll(posts)).map((post) => post.uri)).toEqual([good.uri]);
      expect(logs.output()).toContain('Skipped');
      expect(logs.output()).not.toContain('secret');
    });
  });

  describe('deleting', () => {
    it('deletes the post by its record key', async () => {
      const { posts, repo } = setUp([]);

      await posts.deletePost({
        connectedAccount: CONNECTED,
        post: backedUp(`at://${DID}/app.bsky.feed.post/3kabc`),
      });

      expect(repo.deleted).toEqual(['3kabc']);
    });

    it("refuses a post from another account, or anything that isn't a post", async () => {
      const { posts, repo } = setUp([]);

      for (const uri of [
        'at://did:plc:other/app.bsky.feed.post/3kabc',
        `at://${DID}/app.bsky.feed.like/3kabc`,
        'not a uri',
      ]) {
        await expect(
          posts.deletePost({ connectedAccount: CONNECTED, post: backedUp(uri) }),
        ).rejects.toThrow(/not one of this account's posts/);
      }
      expect(repo.deleted).toEqual([]);
    });
  });

  describe('restoring', () => {
    const post = {
      uri: `at://${DID}/app.bsky.feed.post/3kabc` as PostUri,
      cid: 'bafyrecord',
      createdAt: NOW,
      record: { $type: 'app.bsky.feed.post', text: 'Back again', createdAt: NOW.toISOString() },
      media: [],
    };

    it('re-creates the exact record at its original record key', async () => {
      const { posts, repo } = setUp([]);

      const result = await posts.restorePost({ connectedAccount: CONNECTED, post });

      expect(result).toBe('restored');
      expect(repo.created).toEqual([{ rkey: '3kabc', record: post.record }]);
    });

    it('creates nothing when the post is already there', async () => {
      const { posts, repo } = setUp([]);
      repo.existing.add('3kabc');

      const result = await posts.restorePost({ connectedAccount: CONNECTED, post });

      expect(result).toBe('already-there');
      expect(repo.created).toEqual([]);
    });

    it("refuses a post that isn't this account's", async () => {
      const { posts, repo } = setUp([]);

      await expect(
        posts.restorePost({
          connectedAccount: CONNECTED,
          post: { ...post, uri: 'at://did:plc:other/app.bsky.feed.post/3kabc' as PostUri },
        }),
      ).rejects.toThrow(/not one of this account's posts/);
      expect(repo.created).toEqual([]);
    });

    it('uploads a file with its type', async () => {
      const { posts, repo } = setUp([]);

      await posts.uploadMedia({
        connectedAccount: CONNECTED,
        media: {
          cid: 'bafkimage',
          mimeType: 'image/png',
          bytes: new Uint8Array(Buffer.from('png')),
        },
      });

      expect(repo.uploaded).toEqual(['image/png png']);
    });
  });

  it("fetches a file's bytes", async () => {
    const { posts } = setUp([]);

    const bytes = await posts.fetchMedia({
      connectedAccount: CONNECTED,
      media: { cid: 'bafkimage1', mimeType: 'image/jpeg' },
    });

    expect(Buffer.from(bytes).toString()).toBe('blob bafkimage1');
  });
});
