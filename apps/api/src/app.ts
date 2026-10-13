import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { health } from './routes/health';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());

  app.route('/health', health);

  return app;
}
