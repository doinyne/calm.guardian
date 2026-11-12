import type { ErrorBoundaryProps } from 'expo-router';
import { Link } from 'expo-router';
import { View } from 'react-native';

import { CalmCore } from '@/components/calm-core';
import { MonoLabel } from '@/components/mono-label';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/**
 * What a screen shows if it crashes, instead of a red developer screen. Calm Mode itself runs on the
 * server, so it's true that nothing is lost. The error's details aren't shown: they can contain data.
 */
export function CalmErrorScreen({ retry }: Pick<ErrorBoundaryProps, 'retry'>) {
  return (
    <Screen className="items-stretch justify-center gap-6">
      <View className="items-center">
        <CalmCore state="standing-by" size={140} />
      </View>
      <View className="gap-3">
        <MonoLabel tone="primary">Something went wrong</MonoLabel>
        <Text variant="h3" role="heading">
          This screen hit a problem
        </Text>
        <Text className="text-muted-foreground">
          Your posts are safe, and Calm Mode carries on as it was. Please try again.
        </Text>
      </View>
      <View className="gap-2">
        <Button size="lg" onPress={() => void retry()}>
          <Text>Try again</Text>
        </Button>
        <Link href="/support" asChild>
          <Button variant="link">
            <Text className="text-muted-foreground underline">Need to talk to someone?</Text>
          </Button>
        </Link>
      </View>
    </Screen>
  );
}
