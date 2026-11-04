import { z } from 'zod';

import {
  ConnectedAccountIdSchema,
  type ConnectedAccountId,
} from '../connections/connected-account';
import type { CountHiddenPosts } from '../connections/connection-removal';
import type { SecretBox } from '../crypto/secret-box';
import type { Db } from '../db/database';
import type { Archive, ArchivedPostId } from './archive';
import type { PlatformPost, PostUri } from './platform-posts';

export type ArchiveRepository = Archive & {
  countHiddenForConnectedAccount: CountHiddenPosts;
  /** A backed-up post as it was, for Review and Restore. */
  readPost: (archivedPostId: ArchivedPostId) => Promise<PlatformPost | undefined>;
};

/**
 * Sealed with the post's identity as context, so a record copied onto another row won't open
 * (ADR-0013).
 */
const sealFor = (connectedAccountId: string, uri: string) =>
  `archived_posts:${connectedAccountId}:${uri}`;

const PostRecordSchema = z.record(z.string(), z.unknown());

export function createArchiveRepository({
  db,
  secretBox,
}: {
  db: Db;
  secretBox: SecretBox;
}): ArchiveRepository {
  return {
    async saveAll({ accountId, calmSessionId, connectedAccountId, posts, backedUpAt }) {
      if (posts.length === 0) return;

      // One statement, so the page is stored whole or not at all.
      await db
        .insertInto('archived_posts')
        .values(
          posts.map((post) => ({
            account_id: accountId,
            connected_account_id: connectedAccountId,
            calm_session_id: calmSessionId,
            uri: post.uri,
            cid: post.cid,
            posted_at: post.createdAt,
            record_encrypted: secretBox.seal(
              JSON.stringify(post.record),
              sealFor(connectedAccountId, post.uri),
            ),
            backed_up_at: backedUpAt,
          })),
        )
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
        .execute();
    },

    async listNotHidden(calmSessionId) {
      const rows = await db
        .selectFrom('archived_posts')
        .select(['id', 'connected_account_id', 'uri', 'backed_up_at'])
        .where('calm_session_id', '=', calmSessionId)
        .where('hidden_at', 'is', null)
        .orderBy('posted_at')
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

    async readPost(archivedPostId) {
      const row = await db
        .selectFrom('archived_posts')
        .select(['connected_account_id', 'uri', 'cid', 'posted_at', 'record_encrypted'])
        .where('id', '=', archivedPostId)
        .executeTakeFirst();
      if (!row) return undefined;

      const record = PostRecordSchema.parse(
        JSON.parse(
          secretBox.open(row.record_encrypted, sealFor(row.connected_account_id, row.uri)),
        ),
      );
      return { uri: row.uri as PostUri, cid: row.cid, createdAt: row.posted_at, record };
    },
  };

  async function countWhere(column: 'calm_session_id' | 'connected_account_id', id: string) {
    const { count } = await db
      .selectFrom('archived_posts')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where(column, '=', id)
      .where('hidden_at', 'is not', null)
      .executeTakeFirstOrThrow();
    return Number(count);
  }
}
