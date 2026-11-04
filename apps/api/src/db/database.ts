import { Kysely, PostgresDialect, sql, type Generated } from 'kysely';
import pg from 'pg';

import type { ReadinessCheck } from '../routes/health';

/**
 * Table types, written by hand while the schema is small (ADR-0012). They mirror
 * supabase/migrations; the integration tests use every column, so drift fails tests.
 */
export type ConnectedAccountsTable = {
  id: Generated<string>;
  account_id: string;
  platform: string;
  external_id: string;
  handle: string;
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
};

export type AtprotoOauthStatesTable = {
  key: string;
  value_encrypted: string;
  expires_at: Date;
};

export type AtprotoOauthSessionsTable = {
  key: string;
  value_encrypted: string;
  updated_at: Generated<Date>;
};

export type CalmSessionsTable = {
  id: Generated<string>;
  account_id: string;
  connected_account_id: string;
  state: Generated<string>;
  period_from: Date | null;
  period_to: Date;
  failure: string | null;
  started_at: Date;
  activated_at: Date | null;
  failed_at: Date | null;
  resume_cursor: string | null;
  claimed_until: Date | null;
};

export type ArchivedPostsTable = {
  id: Generated<string>;
  account_id: string;
  connected_account_id: string;
  calm_session_id: string;
  uri: string;
  cid: string;
  posted_at: Date;
  record_encrypted: string;
  backed_up_at: Date;
  hidden_at: Date | null;
};

export type ArchivedMediaTable = {
  id: Generated<string>;
  archived_post_id: string;
  cid: string;
  mime_type: string;
  size_bytes: number;
  content_encrypted: Buffer;
};

export type Database = {
  connected_accounts: ConnectedAccountsTable;
  calm_sessions: CalmSessionsTable;
  archived_posts: ArchivedPostsTable;
  archived_media: ArchivedMediaTable;
  atproto_oauth_states: AtprotoOauthStatesTable;
  atproto_oauth_sessions: AtprotoOauthSessionsTable;
};

export type Db = Kysely<Database>;

// Cloud Run serves many requests per instance through a few connections; Supabase's pooler sits
// behind this (ADR-0012).
const MAX_CONNECTIONS = 5;

export function createDatabase(databaseUrl: string): Db {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: MAX_CONNECTIONS });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/** `/ready` fails while the database is unreachable, so traffic goes to instances that can work. */
export function databaseReadinessCheck(db: Db): ReadinessCheck {
  return {
    name: 'database',
    check: async () => {
      await sql`select 1`.execute(db);
    },
  };
}
