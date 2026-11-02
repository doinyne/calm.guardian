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
    </QueryClientProvider>
  );
}
