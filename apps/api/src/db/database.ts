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

export type Database = {
  connected_accounts: ConnectedAccountsTable;
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
