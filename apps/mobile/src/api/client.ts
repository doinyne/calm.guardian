import type { AppType } from '@calm-guardian/api';
import { QueryClient } from '@tanstack/react-query';
import { hc } from 'hono/client';

import { publicEnv } from '@/config/env';

/** Typed client for our API: request and response types come straight from the API's routes. */
export const apiClient = hc<AppType>(publicEnv.apiUrl);

export const queryClient = new QueryClient();
