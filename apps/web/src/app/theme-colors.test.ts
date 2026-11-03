import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEME_COLORS } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

const globalsCss = readFileSync(join(import.meta.dirname, 'globals.css'), 'utf8');

function brandColorsDeclared(): Record<string, string> {
  const block = /^:root \{([^}]*)\}/m.exec(globalsCss)?.[1] ?? '';
  const declared = new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name = '', value = '']) => [
      name,
      value.trim(),
    ]),
  );

  return Object.fromEntries(
    Object.keys(THEME_COLORS).map((name) => [name, declared.get(name) ?? 'missing']),
  );
}

describe('globals.css', () => {
  it('matches the shared brand colours exactly', () => {
    expect(brandColorsDeclared()).toEqual(THEME_COLORS);
  });

  it('is dark only, so it never follows a light system setting', () => {
    expect(globalsCss).not.toContain('prefers-color-scheme');
    expect(globalsCss).toContain('color-scheme: dark');
  });
});
