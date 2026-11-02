// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import expoConfig from 'eslint-config-expo/flat.js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/.expo/',
    'apps/mobile/ios/',
    'apps/mobile/android/',
    'apps/mobile/expo-env.d.ts',
    'apps/mobile/src/uniwind-types.d.ts',
    '**/.next/',
    'apps/web/next-env.d.ts',
    'supabase/',
  ]),

  js.configs.recommended,

  {
    files: ['apps/mobile/**/*.{js,jsx,ts,tsx}'],
    extends: [expoConfig],
  },
  {
    // The TypeScript compiler already reports unresolved imports, including the `@/` alias.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: { 'import/no-unresolved': 'off' },
  },

  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    extends: [nextCoreWebVitals],
    settings: { next: { rootDir: 'apps/web/' } },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      eqeqeq: 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },

  prettier,
]);
