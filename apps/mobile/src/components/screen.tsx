import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/utils';

/** A full screen whose content stays clear of the notch, status bar and home indicator. */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={cn('flex-1 bg-background px-6', className)}
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {children}
    </View>
  );
}
