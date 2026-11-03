import { Stack } from 'expo-router';

/** A plain header with just a back button, for the steps after the welcome screen. */
const STEP_HEADER = {
  headerShown: true,
  title: '',
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
} as const;

/** Screens for people who aren't signed in: welcome, then sign-in by emailed code. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" options={STEP_HEADER} />
      <Stack.Screen name="verify-code" options={STEP_HEADER} />
    </Stack>
  );
}
