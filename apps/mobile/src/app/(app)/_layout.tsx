import { Stack } from 'expo-router';

import { CalmModeIndicator } from '@/features/calm/calm-indicator';

/** Screens for signed-in users. Guardians land here in M6. */
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
      <Stack.Screen
        name="review"
        options={{
          headerShown: true,
          title: 'Review',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => <CalmModeIndicator />,
        }}
      />
      <Stack.Screen
        name="guardians"
        options={{
          headerShown: true,
          title: 'Guardians',
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => <CalmModeIndicator />,
        }}
      />
      <Stack.Screen
        name="looking-after"
        options={{
          headerShown: true,
          title: 'People you look after',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Stack.Screen name="connect/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="calm/[target]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
