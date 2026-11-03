import { z } from 'zod';

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

export type Config = {
  port: number;
  logLevel: LogLevel;
  supabase: SupabaseConfig;
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Plain http is only acceptable for a local Supabase; anything remote must use https. */
const isSecureOrLocal = (url: string) => {
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' || (protocol === 'http:' && LOOPBACK_HOSTS.has(hostname));
};

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SUPABASE_URL: z
    .url()
    .refine(isSecureOrLocal, 'must use https (http is allowed only for a local Supabase)'),
  SUPABASE_SECRET_KEY: z.string().min(1),
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

  const { PORT, LOG_LEVEL, SUPABASE_URL, SUPABASE_SECRET_KEY } = result.data;
  return {
    port: PORT,
    logLevel: LOG_LEVEL,
    supabase: supabaseConfig(SUPABASE_URL, SUPABASE_SECRET_KEY),
  };
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
