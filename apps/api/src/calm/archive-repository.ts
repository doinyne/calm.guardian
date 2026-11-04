import type { Selectable } from 'kysely';
import { z } from 'zod';

import {
  ConnectedAccountIdSchema,
  type ConnectedAccountId,
} from '../connections/connected-account';
import type { CountHiddenPosts } from '../connections/connection-removal';
import type { SecretBox } from '../crypto/secret-box';
import type { Db } from '../db/database';
import type { AccountId } from '../accounts/account-id';
import type { ArchivedPostsTable } from '../db/database';
import type {
  Archive,
  ArchivedPostId,
  MediaCopy,
  ReviewArchive,
  ReviewItem,
  ReviewState,
} from './archive';
import type { MediaRef, PlatformPost, PostUri } from './platform-posts';

export type ArchiveRepository = Archive &
  ReviewArchive & {
    countHiddenForConnectedAccount: CountHiddenPosts;
    /** A backed-up post as it was, for Review and Restore. */
    readPost: (archivedPostId: ArchivedPostId) => Promise<PlatformPost | undefined>;
    /** Copies of the post's files, decrypted. */
    readMedia: (archivedPostId: ArchivedPostId) => Promise<MediaCopy[]>;
  };

/**
 * Sealed with the post's identity (and the file's) as context, so a value copied onto another row
 * won't open (ADR-0013).
 */
const sealPostFor = (connectedAccountId: string, uri: string) =>
  `archived_posts:${connectedAccountId}:${uri}`;
const sealMediaFor = (connectedAccountId: string, uri: string, cid: string) =>
  `archived_media:${connectedAccountId}:${uri}:${cid}`;

const PostRecordSchema = z.record(z.string(), z.unknown());

export function createArchiveRepository({
  db,
  secretBox,
}: {
  db: Db;
  secretBox: SecretBox;
}): ArchiveRepository {
  return {
    async save({ accountId, calmSessionId, connectedAccountId, post, media, backedUpAt }) {
      // One transaction: the post and all its files are stored together, or not at all.
      const id = await db.transaction().execute(async (trx) => {
        const { id: archivedPostId } = await trx
          .insertInto('archived_posts')
          .values({
            account_id: accountId,
            connected_account_id: connectedAccountId,
            calm_session_id: calmSessionId,
            uri: post.uri,
            cid: post.cid,
            posted_at: post.createdAt,
            record_encrypted: secretBox.seal(
              JSON.stringify(post.record),
              sealPostFor(connectedAccountId, post.uri),
            ),
            backed_up_at: backedUpAt,
          })
          .onConflict((conflict) =>
            conflict.columns(['connected_account_id', 'uri']).doUpdateSet((eb) => ({
              calm_session_id: eb.ref('excluded.calm_session_id'),
              cid: eb.ref('excluded.cid'),
              posted_at: eb.ref('excluded.posted_at'),
              record_encrypted: eb.ref('excluded.record_encrypted'),
              backed_up_at: eb.ref('excluded.backed_up_at'),
              // It was listed on the Platform, so it's visible, whatever we last knew.
              hidden_at: null,
            })),
          )
          .returning('id')
          .executeTakeFirstOrThrow();

        for (const copy of media) {
          const content_encrypted = secretBox.sealBytes(
            copy.bytes,
            sealMediaFor(connectedAccountId, post.uri, copy.cid),
          );
          await trx
            .insertInto('archived_media')
            .values({
              archived_post_id: archivedPostId,
              cid: copy.cid,
              mime_type: copy.mimeType,
              size_bytes: copy.bytes.byteLength,
              content_encrypted,
            })
            .onConflict((conflict) =>
              conflict.columns(['archived_post_id', 'cid']).doUpdateSet((eb) => ({
                mime_type: eb.ref('excluded.mime_type'),
                size_bytes: eb.ref('excluded.size_bytes'),
                content_encrypted: eb.ref('excluded.content_encrypted'),
              })),
            )
            .execute();
        }
        return archivedPostId;
      });
      return { id: id as ArchivedPostId, connectedAccountId, uri: post.uri, backedUpAt };
    },

    async listNotHidden(calmSessionId) {
      const rows = await db
        .selectFrom('archived_posts')
        .select(['id', 'connected_account_id', 'uri', 'backed_up_at'])
        .where('calm_session_id', '=', calmSessionId)
        .where('hidden_at', 'is', null)
        .orderBy('posted_at', 'desc')
        .execute();
      return rows.map((row) => ({
        id: row.id as ArchivedPostId,
        connectedAccountId: ConnectedAccountIdSchema.parse(row.connected_account_id),
        uri: row.uri as PostUri,
        backedUpAt: row.backed_up_at,
      }));
    },

    async markHidden({ archivedPostId, hiddenAt }) {
      await db
        .updateTable('archived_posts')
        .set({ hidden_at: hiddenAt })
        .where('id', '=', archivedPostId)
        .execute();
    },

    async countHidden(calmSessionId) {
      return countWhere('calm_session_id', calmSessionId);
    },

    async countHiddenForConnectedAccount(connectedAccountId: ConnectedAccountId) {
      return countWhere('connected_account_id', connectedAccountId);
    },

    async listHidden({ accountId, limit }) {
      const rows = await selectReviewRows()
        .where('account_id', '=', accountId)
        .where('hidden_at', 'is not', null)
        .where('restored_at', 'is', null)
        // Still to review first, then kept hidden; newest first within each.
        .orderBy((eb) => eb('kept_hidden_at', 'is not', null))
        .orderBy('posted_at', 'desc')
        .limit(limit + 1)
        .execute();
      const page = rows.slice(0, limit);
      const files = await mediaRefsOf(page.map((row) => row.id));
      return {
        items: page.map((row) => withMedia(toReviewItem(row), files.get(row.id) ?? [])),
        more: rows.length > limit,
      };
    },

    async find({ accountId, archivedPostId }) {
      const row = await selectReviewRows()
        .where('id', '=', archivedPostId)
        .where('account_id', '=', accountId)
        .where('hidden_at', 'is not', null)
        .executeTakeFirst();
      if (!row) return undefined;
      const media = await readMediaOf(row);
      return {
        ...withMedia(
          toReviewItem(row),
          media.map(({ cid, mimeType }) => ({ cid, mimeType })),
        ),
        media,
      };
    },

    async listToRestore({ connectedAccountId, limit }) {
      const rows = await db
        .selectFrom('archived_posts')
        .select('id')
        .where('connected_account_id', '=', connectedAccountId)
        .where('hidden_at', 'is not', null)
        .where('restored_at', 'is', null)
        .where('kept_hidden_at', 'is', null)
        .orderBy('posted_at')
        .limit(limit)
        .execute();
      return rows.map((row) => row.id as ArchivedPostId);
    },

    async markRestored({ archivedPostId, restoredAt }) {
      await db
        .updateTable('archived_posts')
        .set({ restored_at: restoredAt })
        .where('id', '=', archivedPostId)
        .execute();
    },

    async markKeptHidden({ archivedPostId, keptAt }) {
      await db
        .updateTable('archived_posts')
        .set({ kept_hidden_at: keptAt })
        .where('id', '=', archivedPostId)
        .execute();
    },

    async deleteForGood({ accountId, archivedPostId }) {
      // Its files go with it (the cascade in the migration).
      await db
        .deleteFrom('archived_posts')
        .where('id', '=', archivedPostId)
        .where('account_id', '=', accountId)
        .execute();
    },

    async countToReview(accountId: AccountId) {
      const { count } = await db
        .selectFrom('archived_posts')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('account_id', '=', accountId)
        .where('hidden_at', 'is not', null)
        .where('restored_at', 'is', null)
        .where('kept_hidden_at', 'is', null)
        .executeTakeFirstOrThrow();
      return Number(count);
    },

    async readPost(archivedPostId) {
      const row = await db
        .selectFrom('archived_posts')
        .select(['connected_account_id', 'uri', 'cid', 'posted_at', 'record_encrypted'])
        .where('id', '=', archivedPostId)
        .executeTakeFirst();
      if (!row) return undefined;

      const record = PostRecordSchema.parse(
        JSON.parse(
          secretBox.open(row.record_encrypted, sealPostFor(row.connected_account_id, row.uri)),
        ),
      );
      const media = await mediaRowsOf(archivedPostId);
      return {
        uri: row.uri as PostUri,
        cid: row.cid,
        createdAt: row.posted_at,
        record,
        media: media.map(({ cid, mime_type }) => ({ cid, mimeType: mime_type })),
      };
    },

    async readMedia(archivedPostId) {
      const post = await db
        .selectFrom('archived_posts')
        .select(['connected_account_id', 'uri'])
        .where('id', '=', archivedPostId)
        .executeTakeFirst();
      if (!post) return [];

      return (await mediaRowsOf(archivedPostId)).map((row) => ({
        cid: row.cid,
        mimeType: row.mime_type,
        bytes: secretBox.openBytes(
          row.content_encrypted,
          sealMediaFor(post.connected_account_id, post.uri, row.cid),
        ),
      }));
    },
  };

  function selectReviewRows() {
    return db
      .selectFrom('archived_posts')
      .select([
        'id',
        'connected_account_id',
        'uri',
        'cid',
        'posted_at',
        'record_encrypted',
        'hidden_at',
        'restored_at',
        'kept_hidden_at',
        'backed_up_at',
      ]);
  }

  type ReviewRow = Pick<
    Selectable<ArchivedPostsTable>,
    | 'id'
    | 'connected_account_id'
    | 'uri'
    | 'cid'
    | 'posted_at'
    | 'record_encrypted'
    | 'hidden_at'
    | 'restored_at'
    | 'kept_hidden_at'
    | 'backed_up_at'
  >;

  /** The one place an Archive row becomes a post as Review shows it, decrypted. */
  function toReviewItem(row: ReviewRow): ReviewItem {
    const state: ReviewState = row.restored_at
      ? 'restored'
      : row.kept_hidden_at
        ? 'kept-hidden'
        : 'to-review';
    return {
      id: row.id as ArchivedPostId,
      connectedAccountId: ConnectedAccountIdSchema.parse(row.connected_account_id),
      state,
      hiddenAt: row.hidden_at ?? row.backed_up_at,
      post: {
        uri: row.uri as PostUri,
        cid: row.cid,
        createdAt: row.posted_at,
        record: openRecord(row),
        media: [],
      },
    };
  }

  function openRecord(row: Pick<ReviewRow, 'connected_account_id' | 'uri' | 'record_encrypted'>) {
    return PostRecordSchema.parse(
      JSON.parse(
        secretBox.open(row.record_encrypted, sealPostFor(row.connected_account_id, row.uri)),
      ),
    );
  }

  async function readMediaOf(row: Pick<ReviewRow, 'id' | 'connected_account_id' | 'uri'>) {
    return (await mediaRowsOf(row.id as ArchivedPostId)).map((media) => ({
      cid: media.cid,
      mimeType: media.mime_type,
      bytes: secretBox.openBytes(
        media.content_encrypted,
        sealMediaFor(row.connected_account_id, row.uri, media.cid),
      ),
    }));
  }

  /** Which files each post has, without their contents. */
  async function mediaRefsOf(archivedPostIds: readonly string[]) {
    const byPost = new Map<string, MediaRef[]>();
    if (archivedPostIds.length === 0) return byPost;
    const rows = await db
      .selectFrom('archived_media')
      .select(['archived_post_id', 'cid', 'mime_type'])
      .where('archived_post_id', 'in', archivedPostIds)
      .orderBy('cid')
      .execute();
    for (const row of rows) {
      byPost.set(row.archived_post_id, [
        ...(byPost.get(row.archived_post_id) ?? []),
        { cid: row.cid, mimeType: row.mime_type },
      ]);
    }
    return byPost;
  }

  function mediaRowsOf(archivedPostId: ArchivedPostId) {
    return db
      .selectFrom('archived_media')
      .select(['cid', 'mime_type', 'content_encrypted'])
      .where('archived_post_id', '=', archivedPostId)
      .orderBy('cid')
      .execute();
  }

  async function countWhere(column: 'calm_session_id' | 'connected_account_id', id: string) {
    const { count } = await db
      .selectFrom('archived_posts')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where(column, '=', id)
      .where('hidden_at', 'is not', null)
      .where('restored_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(count);
  }
}

function withMedia(item: ReviewItem, media: readonly MediaRef[]): ReviewItem {
  return { ...item, post: { ...item.post, media } };
}
