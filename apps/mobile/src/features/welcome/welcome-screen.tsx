import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { Screen } from '@/components/screen';
import { Text } from '@/components/ui/text';

const AnimatedView = withUniwind(Animated.View);

// Gentle entrance; skipped entirely when the user has Reduce Motion turned on.
const ENTRANCE = FadeInDown.duration(600).reduceMotion(ReduceMotion.System);

export function WelcomeScreen({ diagnostics }: { diagnostics?: ReactNode }) {
  return (
    <Screen>
      <AnimatedView entering={ENTRANCE} className="flex-1 justify-center gap-4">
        <Text variant="h1">Calm Guardian</Text>
        <Text variant="lead" className="text-center">
          Take a break from social media whenever you need one. Your posts stay safe until
          you&apos;re ready to bring them back.
        </Text>
      </AnimatedView>
      {diagnostics ? <View className="pb-4">{diagnostics}</View> : null}
    </Screen>
  );
}
