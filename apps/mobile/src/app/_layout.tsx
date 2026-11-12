import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Uniwind } from 'uniwind';

import { accountAuth } from '@/account/account-auth-client';
import { AccountSessionProvider, useAccountSession } from '@/account/account-session';
import { queryClient } from '@/api/client';
import { CalmErrorScreen } from '@/components/calm-error-screen';
import { NAVIGATION_THEME } from '@/lib/navigation-theme';

/** A calm screen instead of the default red one if anything below crashes. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <CalmErrorScreen retry={retry} />;
}

// Keep the splash screen up until we know whether someone is signed in, so a signed-in user never
// sees the welcome screen flash past.
void SplashScreen.preventAutoHideAsync();

// Dark only for launch (ADR-0007), whatever the phone's own setting, so `dark:` styles always apply.
Uniwind.setTheme('dark');

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
    <ThemeProvider value={NAVIGATION_THEME}>
      <StatusBar style="light" />
      {/* Each group says where to send people it turns away. Without that, a signed-out
          user opening the app at "/" gets an unmatched route instead of the welcome screen. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isSignedIn} redirectTo="/welcome">
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!isSignedIn} redirectTo="/">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="support" options={{ presentation: 'modal' }} />
      </Stack>
      <PortalHost />
    </ThemeProvider>
  );
}
