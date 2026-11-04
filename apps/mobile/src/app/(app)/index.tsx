import { Link, useRouter } from 'expo-router';
import { View } from 'react-native';

import { MonoLabel } from '@/components/mono-label';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CalmHome } from '@/features/calm/calm-home';
import { CalmModeIndicator } from '@/features/calm/calm-indicator';

export default function HomeRoute() {
  const router = useRouter();

  return (
    <Screen className="gap-6 pt-2">
      <View className="flex-row items-center justify-between gap-3">
        <MonoLabel>Calm Guardian</MonoLabel>
        <View className="flex-row items-center gap-2">
          <CalmModeIndicator />
          <Link href="/settings" asChild>
            <Button variant="ghost">
              <Text>Settings</Text>
            </Button>
          </Link>
        </View>
      </View>
      <CalmHome
        onTurnOn={(target) =>
          router.push({
            pathname: '/calm/[target]',
            params: { target: target === 'all' ? 'all' : target.connectedAccountId },
          })
        }
        onConnect={() => router.push('/connect')}
      />
    </Screen>
  );
}
