import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// Integration tests talk to local Supabase (`supabase start`), using the same .env as `npm run dev`.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    // Real network calls to the local Supabase stack.
    testTimeout: 15_000,
  },
});
