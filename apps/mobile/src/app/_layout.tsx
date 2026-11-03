import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useUniwind } from 'uniwind';

import { accountAuth } from '@/account/account-auth-client';
import { AccountSessionProvider, useAccountSession } from '@/account/account-session';
import { queryClient } from '@/api/client';
import { NAVIGATION_THEME } from '@/lib/navigation-theme';

export { ErrorBoundary } from 'expo-router';

// Keep the splash screen up until we know whether someone is signed in, so a signed-in user never
// sees the welcome screen flash past.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AccountSessionProvider auth={accountAuth}>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </AccountSessionProvider>
  );
}

function RootNavigator() {
  const { theme } = useUniwind();
  const colorScheme = theme === 'dark' ? 'dark' : 'light';
  const session = useAccountSession();
  const isSignedIn = session.status === 'signed-in';

  useEffect(() => {
    if (session.status !== 'restoring') void SplashScreen.hideAsync();
  }, [session.status]);

  // Cached API responses belong to whoever was signed in. Drop them as soon as nobody is.
  useEffect(() => {
    if (session.status === 'signed-out') queryClient.clear();
  }, [session.status]);

  return (
    <ThemeProvider value={NAVIGATION_THEME[colorScheme]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* Each group says where to send people it turns away. Without that, a signed-out
          user opening the app at "/" gets an unmatched route instead of the welcome screen. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isSignedIn} redirectTo="/welcome">
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!isSignedIn} redirectTo="/">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <PortalHost />
    </ThemeProvider>
  );
}
