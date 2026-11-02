import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Config = {
  port: number;
  logLevel: LogLevel;
};

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
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

  return { port: result.data.PORT, logLevel: result.data.LOG_LEVEL };
}
