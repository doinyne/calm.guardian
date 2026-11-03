import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { CalmCore } from '@/components/calm-core';
import { MonoLabel } from '@/components/mono-label';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ConnectedAccountsPanel } from '@/features/connections/connected-accounts-panel';

// The Calm controls arrive with Calm Mode (M3); slice 3 of M1 gives the accounts their real design.
export default function HomeRoute() {
  return (
    <Screen className="gap-6 pt-2">
      <View className="flex-row items-center justify-between">
        <MonoLabel>Calm Guardian</MonoLabel>
        <Link href="/settings" asChild>
          <Button variant="ghost">
            <Text>Settings</Text>
          </Button>
        </Link>
      </View>
      <View className="flex-row items-center gap-5">
        <CalmCore state="standing-by" size={112} />
        <View className="flex-1 gap-2">
          <MonoLabel>Standing by</MonoLabel>
          <Text variant="h3">Calm Mode is off</Text>
          <Text className="text-muted-foreground">Your posts are visible as usual.</Text>
        </View>
      </View>
      <ScrollView contentContainerClassName="pb-6">
        <ConnectedAccountsPanel />
      </ScrollView>
    </Screen>
  );
}
