import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { CalmCore } from '@/components/calm-core';
import { MonoLabel } from '@/components/mono-label';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const AnimatedView = withUniwind(Animated.View);

// Gentle entrance; skipped entirely when the user has Reduce Motion turned on.
const ENTRANCE = FadeInDown.duration(600).reduceMotion(ReduceMotion.System);

export function WelcomeScreen({ diagnostics }: { diagnostics?: ReactNode }) {
  return (
    <Screen className="gap-6 pt-4">
      <View className="flex-row items-center justify-between">
        <MonoLabel>Calm Guardian</MonoLabel>
        <View className="flex-row items-center gap-2">
          <View className="size-1.5 rounded-full bg-primary" />
          <MonoLabel>All systems calm</MonoLabel>
        </View>
      </View>

      <View className="flex-1 items-center justify-center">
        <CalmCore state="ready" size={240} />
      </View>

      <AnimatedView entering={ENTRANCE} className="gap-3">
        <MonoLabel tone="primary">Your command centre</MonoLabel>
        <Text variant="h1" className="text-left">
          You&apos;re in control.
        </Text>
        <Text className="text-lg leading-7 text-muted-foreground">
          Take a break from social media whenever you need one. Your posts stay safe until
          you&apos;re ready to bring them back.
        </Text>
      </AnimatedView>

      <View className="gap-2 pb-4">
        <Link href="/how-it-works" asChild>
          <Button size="lg" className="shadow-lg shadow-primary/40">
            <Text>Get started</Text>
          </Button>
        </Link>
        <Link href="/support" asChild>
          <Button variant="link">
            <Text className="text-muted-foreground underline">Need to talk to someone now?</Text>
          </Button>
        </Link>
        {diagnostics}
      </View>
    </Screen>
  );
}
