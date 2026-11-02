import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEME_COLORS, type ColorScheme } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

const globalsCss = readFileSync(join(import.meta.dirname, 'globals.css'), 'utf8');

const BLOCK_PATTERN: Record<ColorScheme, RegExp> = {
  light: /^:root \{([^}]*)\}/m,
  dark: /prefers-color-scheme: dark\)\s*\{\s*:root \{([^}]*)\}/,
};

function brandColorsDeclaredFor(scheme: ColorScheme): Record<string, string> {
  const block = BLOCK_PATTERN[scheme].exec(globalsCss)?.[1] ?? '';
  const declared = new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name = '', value = '']) => [
      name,
      value.trim(),
    ]),
  );

  return Object.fromEntries(
    Object.keys(THEME_COLORS[scheme]).map((name) => [name, declared.get(name) ?? 'missing']),
  );
}

describe('globals.css', () => {
  it.each(['light', 'dark'] as const)('matches the shared %s brand colours exactly', (scheme) => {
    expect(brandColorsDeclaredFor(scheme)).toEqual(THEME_COLORS[scheme]);
  });
});
