import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

import { Text } from '@/components/ui/text';

/** A problem the user can act on. Screen readers announce it as soon as it appears. */
export function ErrorMessage({ children }: { children: string }) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(children);
  }, [children]);

  return (
    <Text role="alert" accessibilityLiveRegion="polite" className="text-destructive">
      {children}
    </Text>
  );
}
