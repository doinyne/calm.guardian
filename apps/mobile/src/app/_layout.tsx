import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { useUniwind } from 'uniwind';

import { useAccountSession } from '@/account/use-account-session';
import { queryClient } from '@/api/client';
import { NAVIGATION_THEME } from '@/lib/navigation-theme';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { theme } = useUniwind();
  const colorScheme = theme === 'dark' ? 'dark' : 'light';
  const { isSignedIn } = useAccountSession();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={NAVIGATION_THEME[colorScheme]}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={isSignedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
        <PortalHost />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
