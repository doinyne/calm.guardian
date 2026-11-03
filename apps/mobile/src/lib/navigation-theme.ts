import { THEME_COLORS } from '@calm-guardian/shared';
import { DarkTheme, type Theme } from 'expo-router/react-navigation';

/** Navigation chrome (headers, tab bars, screen backgrounds) in the brand colours. Dark only. */
export const NAVIGATION_THEME: Theme = {
  ...DarkTheme,
  colors: {
    background: THEME_COLORS.background,
    border: THEME_COLORS.border,
    card: THEME_COLORS.background,
    notification: THEME_COLORS.destructive,
    primary: THEME_COLORS.primary,
    text: THEME_COLORS.foreground,
  },
};
