# 0007: Styling with `StyleSheet` and typed theme tokens

**Status:** Proposed · **Date:** 2026-11-02

## Context
v1 used `StyleSheet` with a light-only `Colors.ts` taken from the Stitch Material 3 palette. Both
stores' users expect dark mode, and accessibility (contrast, font scaling) is part of being store-ready.

## Options
1. **`StyleSheet` + typed tokens and a `useTheme()` hook.** No extra dependencies; it's what React Native ships.
2. **NativeWind (Tailwind).** Fast to write, but it's another compiler layer that has had breaking
   changes across Expo SDKs.
3. **Unistyles / Tamagui.** Powerful, but more to learn and more to upgrade.

## Decision
Option 1. `apps/mobile/src/theme/` holds:
- `palette.ts`: light and dark colour tokens. Light is the v1 Stitch palette; dark is derived from the
  same Material 3 tonal roles.
- `spacing`, `radius` and `typography` scales.
- `useTheme()`, which picks the palette from `useColorScheme()`.

Components never hard-code colours.

## Consequences
- No styling dependencies to keep in step with the Expo SDK.
- Text must use the typography scale and respect the system font size (no `allowFontScaling={false}`).
- Dark-mode contrast must be checked by eye and with an accessibility inspector in M7.
