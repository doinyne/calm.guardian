import { publicEnv } from '@/config/env';

import { createSupabaseAccountAuth } from './supabase-account-auth';

/** The app's one sign-in client. Tests swap this module for a `FakeAccountAuth` (jest.setup.js). */
export const accountAuth = createSupabaseAccountAuth({
  url: publicEnv.supabaseUrl,
  publishableKey: publicEnv.supabasePublishableKey,
});
