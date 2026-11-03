import type { AppType } from '@calm-guardian/api';
import { QueryClient } from '@tanstack/react-query';
import { hc } from 'hono/client';

import { accountAuth } from '@/account/account-auth-client';
import { publicEnv } from '@/config/env';

/**
 * Typed client for our API: request and response types come straight from the API's routes. Every
 * request carries the signed-in user's access token; the API works out the Account from it.
 */
export const apiClient = hc<AppType>(publicEnv.apiUrl, {
  headers: async (): Promise<Record<string, string>> => {
    const accessToken = await accountAuth.getAccessToken();
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  },
});

export const queryClient = new QueryClient();
