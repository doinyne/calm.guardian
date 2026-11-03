import { Platform } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// System monospace until the brand fonts land (they need a native build).
const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });

const TONE_CLASS = {
  muted: 'text-muted-foreground',
  primary: 'text-primary',
} as const;

/**
 * A small monospace status label, the "mission control" readout: `CALM MODE · STANDING BY`. Always
 * pair it with a plain sentence nearby; it's a glanceable summary, not the explanation.
 */
export function MonoLabel({
  children,
  tone = 'muted',
  className,
}: {
  children: string;
  tone?: keyof typeof TONE_CLASS;
  className?: string;
}) {
  return (
    <Text
      className={cn('text-xs uppercase tracking-widest', TONE_CLASS[tone], className)}
      style={{ fontFamily: MONO_FONT }}
    >
      {children}
    </Text>
  );
}
