/**
 * The canonical brand colours for the app, the website and the splash screen (ADR-0007).
 *
 * Names follow shadcn/ui's semantic tokens, which React Native Reusables and KokonutUI use. Light
 * values come from the Stitch "Sanctuary" designs (Material 3 teal). Dark values are derived from the
 * same seed with Material 3 tonal roles.
 *
 * The CSS files that use these are hand-written, and tests fail if they drift from this file.
 */
export const THEME_COLORS = {
  light: {
    background: '#f8fafa',
    foreground: '#2d3435',
    card: '#ffffff',
    'card-foreground': '#2d3435',
    popover: '#ffffff',
    'popover-foreground': '#2d3435',
    primary: '#006b63',
    'primary-foreground': '#e2fff9',
    secondary: '#d4e6e5',
    'secondary-foreground': '#445554',
    muted: '#eaefef',
    'muted-foreground': '#596061',
    accent: '#81f3e5',
    'accent-foreground': '#005a53',
    destructive: '#a83836',
    border: '#dde4e4',
    // Form field outlines need 3:1 contrast against the background (WCAG 1.4.11).
    input: '#757c7d',
    ring: '#006b63',
  },
  dark: {
    background: '#0e1414',
    foreground: '#dde4e3',
    card: '#1a2120',
    'card-foreground': '#dde4e3',
    popover: '#1a2120',
    'popover-foreground': '#dde4e3',
    primary: '#72e4d7',
    'primary-foreground': '#003733',
    secondary: '#2f3636',
    'secondary-foreground': '#d4e6e5',
    muted: '#252b2b',
    'muted-foreground': '#bec9c7',
    accent: '#00504a',
    'accent-foreground': '#81f3e5',
    destructive: '#ffb4ab',
    border: '#3f4948',
    input: '#899391',
    ring: '#72e4d7',
  },
} as const satisfies Record<'light' | 'dark', Record<string, `#${string}`>>;

export type ColorScheme = keyof typeof THEME_COLORS;
export type ThemeColorName = keyof (typeof THEME_COLORS)['light'];
