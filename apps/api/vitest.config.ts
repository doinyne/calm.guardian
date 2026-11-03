import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests only. Integration tests need a running local Supabase: see vitest.integration.config.ts.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
