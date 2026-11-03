import { Stack } from 'expo-router';

/** Screens for signed-in users. Calm Mode, Review and Guardians land here from M3. */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="settings"
        options={{ headerShown: true, title: 'Settings', headerBackButtonDisplayMode: 'minimal' }}
      />
    </Stack>
  );
}
