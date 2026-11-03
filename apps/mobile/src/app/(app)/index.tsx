import { Link } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function HomeRoute() {
  return (
    <Screen>
      <View className="items-end">
        <Link href="/settings" asChild>
          <Button variant="ghost">
            <Text>Settings</Text>
          </Button>
        </Link>
      </View>
      <View className="flex-1 justify-center">
        <Text variant="h1">Calm Mode</Text>
      </View>
    </Screen>
  );
}
