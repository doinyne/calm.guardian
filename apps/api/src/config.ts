import { z } from 'zod';

import type { EncryptionKey } from './crypto/secret-box';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type SupabaseConfig = {
  url: string;
  /** Server-only admin key. Never log it, return it or send it to the app. */
  secretKey: string;
  /** The `iss` claim Supabase Auth puts in every access token. */
  authIssuer: string;
  /** Where Supabase Auth publishes the public keys that sign access tokens. */
  jwksUrl: URL;
};

/**
 * Which kind of Bluesky OAuth client the API is (ADR-0003, ADR-0017):
 * - `development`: Bluesky's localhost client, for running everything on your own machine.
 * - `public`: deployed. The API publishes its own client details at `clientId`, an https address on
 *   the API itself, so no separate domain is needed.
 */
export type BlueskyClient =
  { kind: 'development'; redirectUrl: URL } | { kind: 'public'; clientId: URL; redirectUrl: URL };

export type BlueskyConfig = {
  client: BlueskyClient;
  /** Where our callback sends people when the app didn't say: back into the app. */
  appReturnUrl: URL;
};

/** Where the deployed API publishes its Bluesky client details, and where Bluesky sends people back. */
export const BLUESKY_CLIENT_METADATA_PATH = '/oauth/client-metadata.json';
export const BLUESKY_CALLBACK_PATH = '/connections/bluesky/callback';

export type Config = {
  port: number;
  logLevel: LogLevel;
  supabase: SupabaseConfig;
  /** Postgres, as a role that bypasses RLS (ADR-0012). Contains a password: never log it. */
  databaseUrl: string;
  /** Newest first: the first key encrypts, all of them decrypt. */
  tokenEncryptionKeys: EncryptionKey[];
  bluesky: BlueskyConfig;
  /** How often the Sweep looks for posts made while Calm Mode is on (ADR-0015). */
  sweepIntervalMs: number;
  /** Where emails go out. Unset: emails are only noted in the log (local dev without Mailpit). */
  smtpUrl: string | null;
  /** The API's public address, for links in emails. */
  publicApiUrl: URL;
};

/** Every 5 minutes (ADR-0015). Shorten it locally to watch the Sweep work. */
const DEFAULT_SWEEP_INTERVAL_SECONDS = 300;
/** Any more often would spend Bluesky's rate limits for little gain. */
const MIN_SWEEP_INTERVAL_SECONDS = 10;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Plain http is only acceptable for a local Supabase; anything remote must use https. */
const isSecureOrLocal = (url: string) => {
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' || (protocol === 'http:' && LOOPBACK_HOSTS.has(hostname));
};

const ENCRYPTION_KEY_BYTES = 32;
const ENCRYPTION_KEY_NAME = /^[a-z0-9-]{1,16}$/;
const KEY_FORMAT_MESSAGE =
  'must be comma-separated "<name>:<base64 32-byte key>" entries, newest first (see .env.example)';

/**
 * `k2:<base64>,k1:<base64>`. Error messages name a key only after its name has passed the pattern
 * check, so a malformed entry can never echo key material.
 */
const EncryptionKeysSchema = z.string().transform((value, ctx): EncryptionKey[] => {
  const keys: EncryptionKey[] = [];
  for (const entry of value.split(',').map((part) => part.trim())) {
    const [id = '', encoded = '', ...extra] = entry.split(':');
    if (!ENCRYPTION_KEY_NAME.test(id) || !encoded || extra.length > 0) {
      ctx.addIssue({ code: 'custom', message: KEY_FORMAT_MESSAGE });
      return z.NEVER;
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== ENCRYPTION_KEY_BYTES) {
      ctx.addIssue({ code: 'custom', message: `key "${id}" must be 32 bytes, base64-encoded` });
      return z.NEVER;
    }
    if (keys.some((existing) => existing.id === id)) {
      ctx.addIssue({ code: 'custom', message: `key name "${id}" is used twice` });
      return z.NEVER;
    }
    keys.push({ id, key });
  }
  return keys;
});

/**
 * Bluesky's development ("loopback") client only allows http://127.0.0.1 or [::1] redirects. Requiring
 * one also stops that client reaching a deployed API, where we need a confidential client (M0b).
 */
const isLoopbackRedirect = (url: string) => {
  const { protocol, hostname } = new URL(url);
  return protocol === 'http:' && (hostname === '127.0.0.1' || hostname === '[::1]');
};

/** The app's own scheme, e.g. calmguardian-dev://. A web URL could hand the code to someone else. */
const isAppLink = (url: string) => !/^https?:$/.test(new URL(url).protocol);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SUPABASE_URL: z
    .url()
    .refine(isSecureOrLocal, 'must use https (http is allowed only for a local Supabase)'),
  SUPABASE_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  TOKEN_ENCRYPTION_KEYS: EncryptionKeysSchema,
  // Only for local development: a deployed API (https PUBLIC_API_URL) derives its own.
  BLUESKY_REDIRECT_URL: z
    .url()
    .refine(
      isLoopbackRedirect,
      'must be http://127.0.0.1:<port>/… while we use the development client',
    )
    .optional(),
  APP_CONNECT_RETURN_URL: z
    .url()
    .refine(
      isAppLink,
      "must use the app's own link scheme, e.g. calmguardian-dev://connect/bluesky",
    ),
  SWEEP_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(MIN_SWEEP_INTERVAL_SECONDS)
    .default(DEFAULT_SWEEP_INTERVAL_SECONDS),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
  PUBLIC_API_URL: z
    .url()
    .refine(isSecureOrLocal, 'must use https (http is allowed only for a local API)')
    .default('http://localhost:3000'),
});

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Reads and validates the environment once, at startup, and fails fast if anything is wrong.
 * The error names the invalid variables but never echoes their values, which may be secrets.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
  }

  const {
    PORT,
    LOG_LEVEL,
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    DATABASE_URL,
    TOKEN_ENCRYPTION_KEYS,
    BLUESKY_REDIRECT_URL,
    APP_CONNECT_RETURN_URL,
    SWEEP_INTERVAL_SECONDS,
    SMTP_URL,
    PUBLIC_API_URL,
  } = result.data;
  return {
    port: PORT,
    logLevel: LOG_LEVEL,
    supabase: supabaseConfig(SUPABASE_URL, SUPABASE_SECRET_KEY),
    databaseUrl: DATABASE_URL,
    tokenEncryptionKeys: TOKEN_ENCRYPTION_KEYS,
    bluesky: {
      client: blueskyClient(new URL(PUBLIC_API_URL), BLUESKY_REDIRECT_URL),
      appReturnUrl: new URL(APP_CONNECT_RETURN_URL),
    },
    sweepIntervalMs: SWEEP_INTERVAL_SECONDS * 1000,
    smtpUrl: SMTP_URL ?? null,
    publicApiUrl: new URL(PUBLIC_API_URL),
  };
}

function blueskyClient(publicApiUrl: URL, developmentRedirect: string | undefined): BlueskyClient {
  if (publicApiUrl.protocol === 'https:') {
    return {
      kind: 'public',
      clientId: new URL(BLUESKY_CLIENT_METADATA_PATH, publicApiUrl),
      redirectUrl: new URL(BLUESKY_CALLBACK_PATH, publicApiUrl),
    };
  }
  if (!developmentRedirect) {
    throw new ConfigError(
      'Invalid environment configuration:\n  BLUESKY_REDIRECT_URL: required when PUBLIC_API_URL is not https (local development)',
    );
  }
  return { kind: 'development', redirectUrl: new URL(developmentRedirect) };
}

function supabaseConfig(rawUrl: string, secretKey: string): SupabaseConfig {
  const url = rawUrl.replace(/\/+$/, '');
  const authIssuer = `${url}/auth/v1`;
  return {
    url,
    secretKey,
    authIssuer,
    jwksUrl: new URL(`${authIssuer}/.well-known/jwks.json`),
  };
}
