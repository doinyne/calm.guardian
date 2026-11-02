import { Stack } from 'expo-router';

/** Screens for people who aren't signed in yet: welcome, then sign-in from M1. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
