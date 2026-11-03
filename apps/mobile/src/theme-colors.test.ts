import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEME_COLORS } from '@calm-guardian/shared';

const globalCss = readFileSync(join(__dirname, 'global.css'), 'utf8');

function brandColorsDeclared(): Record<string, string> {
  const declared = new Map(
    [...globalCss.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name = '', value = '']) => [
      name,
      value.trim(),
    ]),
  );

  return Object.fromEntries(
    Object.keys(THEME_COLORS).map((name) => [name, declared.get(name) ?? 'missing']),
  );
}

describe('global.css', () => {
  it('matches the shared brand colours exactly', () => {
    expect(brandColorsDeclared()).toEqual(THEME_COLORS);
  });
});
