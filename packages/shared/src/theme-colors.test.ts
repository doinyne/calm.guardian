import { describe, expect, it } from 'vitest';

import { THEME_COLORS, type ThemeColorName } from './theme-colors';

/** WCAG 2.2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: ThemeColorName, b: ThemeColorName): number {
  const [lighter, darker] = [luminance(THEME_COLORS[a]), luminance(THEME_COLORS[b])].sort(
    (x, y) => y - x,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** Every text colour on every surface it's drawn on. */
const TEXT_ON_SURFACE: [ThemeColorName, ThemeColorName][] = [
  ...(['foreground', 'muted-foreground', 'primary', 'hope', 'destructive'] as const).flatMap(
    (text) =>
      (['background', 'card', 'muted', 'secondary'] as const).map(
        (surface) => [text, surface] as [ThemeColorName, ThemeColorName],
      ),
  ),
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['hope-foreground', 'hope'],
  ['accent-foreground', 'accent'],
];

describe('theme contrast (WCAG AA)', () => {
  it.each(TEXT_ON_SURFACE)('%s text on %s is at least 4.5:1', (text, surface) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('form field outlines are at least 3:1 against the background and cards', () => {
    expect(contrast('input', 'background')).toBeGreaterThanOrEqual(3);
    expect(contrast('input', 'card')).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring is at least 3:1 against the background', () => {
    expect(contrast('ring', 'background')).toBeGreaterThanOrEqual(3);
  });
});
