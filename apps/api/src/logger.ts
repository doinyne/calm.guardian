import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

import type { LogLevel } from './config';

export type { Logger };

/**
 * Keys whose values must never reach the logs, at any of the first three levels of nesting.
 * This is a safety net: the first defence is not logging bodies, headers or query strings at all.
 */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
];
const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

/** Cloud Logging reads `severity`; pino-pretty (local dev) reads the numeric `level`. */
const CLOUD_LOGGING_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export function createLogger(options: { level: LogLevel; destination?: DestinationStream }) {
  const loggerOptions: LoggerOptions = {
    level: options.level,
    messageKey: 'message',
    base: undefined,
    formatters: {
      level: (label, level) => ({ severity: CLOUD_LOGGING_SEVERITY[label] ?? 'DEFAULT', level }),
    },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };

  return options.destination ? pino(loggerOptions, options.destination) : pino(loggerOptions);
}
