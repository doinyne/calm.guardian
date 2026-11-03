/**
 * The canonical brand colours for the app, the website and the splash screen (ADR-0007): the
 * "mission control" palette. Aqua means you're in control (buttons, active controls). Pink (`hope`)
 * is the rare ray of hope: good news, and the spark at the centre of the core. Dark only for launch;
 * a light palette can come later.
 *
 * Names follow shadcn/ui's semantic tokens, which React Native Reusables and KokonutUI use, plus
 * `hope`. Every text colour here has at least 4.5:1 contrast on `background` and `card`.
 *
 * The CSS files that use these are hand-written, and tests fail if they drift from this file.
 */
export const THEME_COLORS = {
  background: '#0b1026',
  foreground: '#e8f1ff',
  card: '#171f44',
  'card-foreground': '#e8f1ff',
  popover: '#171f44',
  'popover-foreground': '#e8f1ff',
  primary: '#74ffed',
  'primary-foreground': '#0b1026',
  secondary: '#222b57',
  'secondary-foreground': '#e8f1ff',
  muted: '#1b2350',
  'muted-foreground': '#8a96c2',
  accent: '#222b57',
  'accent-foreground': '#74ffed',
  destructive: '#ff8a7a',
  'destructive-foreground': '#0b1026',
  border: '#1f3b4d',
  // Form field outlines need 3:1 contrast against the background (WCAG 1.4.11).
  input: '#3e8389',
  ring: '#74ffed',
  hope: '#f49ad8',
  'hope-foreground': '#0b1026',
} as const satisfies Record<string, `#${string}`>;

export type ThemeColorName = keyof typeof THEME_COLORS;
