import { serve } from '@hono/node-server';

import { createApp } from './app';
import { loadConfig } from './config';
import { createLogger } from './logger';

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

const config = loadConfig(process.env);
const logger = createLogger({ level: config.logLevel });
const app = createApp({ logger, readinessChecks: [] });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port }, 'API listening');
});

// Cloud Run sends SIGTERM and allows ~10 seconds before killing the instance. Stop accepting new
// connections and let in-flight requests finish.
for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down');
    server.close((error) => {
      if (error) logger.error({ err: error }, 'Error while shutting down');
      process.exit(error ? 1 : 0);
    });
  });
}
