import { Stack } from 'expo-router';

import { CalmModeIndicator } from '@/features/calm/calm-indicator';

/** Screens for signed-in users. Review and Guardians land here from M5 and M6. */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
          title: 'Settings',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => <CalmModeIndicator />,
        }}
      />
      <Stack.Screen name="connect/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="calm/[target]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
