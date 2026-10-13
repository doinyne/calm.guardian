import { serve } from '@hono/node-server';

import { createApp } from './app';

const port = 3000; // TODO: read from env when we deploy

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
