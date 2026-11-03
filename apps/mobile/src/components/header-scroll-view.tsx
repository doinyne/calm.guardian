import type { ComponentProps } from 'react';
import { Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BOTTOM_GAP = 24;

/**
 * A scrolling screen under a navigation header.
 *
 * iOS 26+ draws the header as see-through glass with the screen running underneath it, so iOS has to
 * inset the content below the header and above the home indicator (`contentInsetAdjustmentBehavior`).
 * Without that, the first lines of the screen sit behind the header. Android lays the screen out below
 * its header, but the app draws edge to edge, so we keep clear of the gesture bar ourselves.
 */
export function HeaderScrollView({
  contentContainerStyle,
  ...props
}: ComponentProps<typeof ScrollView>) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'ios' ? BOTTOM_GAP : insets.bottom + BOTTOM_GAP;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      {...props}
      contentContainerStyle={[{ paddingBottom: bottomPadding }, contentContainerStyle]}
    />
  );
}
