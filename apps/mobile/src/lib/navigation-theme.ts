import { THEME_COLORS, type ColorScheme } from '@calm-guardian/shared';
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router/react-navigation';

/** Navigation chrome (headers, tab bars, screen backgrounds) in the brand colours. */
export const NAVIGATION_THEME: Record<ColorScheme, Theme> = {
  light: navigationTheme('light', DefaultTheme),
  dark: navigationTheme('dark', DarkTheme),
};

function navigationTheme(scheme: ColorScheme, base: Theme): Theme {
  const colors = THEME_COLORS[scheme];
  return {
    ...base,
    colors: {
      background: colors.background,
      border: colors.border,
      card: colors.card,
      notification: colors.destructive,
      primary: colors.primary,
      text: colors.foreground,
    },
  };
}
