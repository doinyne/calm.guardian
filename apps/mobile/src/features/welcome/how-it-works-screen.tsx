import { Link } from 'expo-router';
import { View } from 'react-native';

import { MonoLabel } from '@/components/mono-label';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { NOT_MEDICAL } from '@/features/support/support-screen';

const STEPS = [
  {
    title: 'Turn on Calm Mode',
    body: 'Choose an account and how far back. Each post is backed up first, then hidden from Bluesky, newest first.',
  },
  {
    title: "You're always in control",
    body: 'Turn it off whenever you like. Nothing comes back until you choose, post by post or all at once.',
  },
  {
    title: 'Someone you trust can help',
    body: "If you'd like, a Guardian can turn Calm Mode on for you. They never see your posts.",
  },
] as const;

/** Before signing in: what Calm Guardian does, in three calm steps, and what it isn't. */
export function HowItWorksScreen() {
  return (
    <Screen className="gap-6 pt-4">
      <MonoLabel tone="primary">How it works</MonoLabel>
      <View className="flex-1 gap-6">
        {STEPS.map((step, index) => (
          <View key={step.title} className="gap-2">
            <MonoLabel>{`0${index + 1}`}</MonoLabel>
            <Text variant="h4">{step.title}</Text>
            <Text className="text-muted-foreground">{step.body}</Text>
          </View>
        ))}
        <Text className="text-sm text-muted-foreground">{NOT_MEDICAL}</Text>
      </View>
      <View className="pb-4">
        <Link href="/sign-in" asChild>
          <Button size="lg">
            <Text>Continue with email</Text>
          </Button>
        </Link>
      </View>
    </Screen>
  );
}
