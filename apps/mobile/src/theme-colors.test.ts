import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEME_COLORS, type ColorScheme } from '@calm-guardian/shared';

const globalCss = readFileSync(join(__dirname, 'global.css'), 'utf8');

function cssColorsFor(scheme: ColorScheme): Record<string, string> {
  const block = new RegExp(`@variant ${scheme} \\{([^}]*)\\}`).exec(globalCss)?.[1] ?? '';
  const declarations = block.matchAll(/--color-([\w-]+):\s*([^;]+);/g);

  return Object.fromEntries(
    [...declarations].map(([, name = '', value = '']) => [name, value.trim()]),
  );
}

describe('global.css', () => {
  it.each(['light', 'dark'] as const)('matches the shared %s brand colours exactly', (scheme) => {
    expect(cssColorsFor(scheme)).toEqual(THEME_COLORS[scheme]);
  });
});
