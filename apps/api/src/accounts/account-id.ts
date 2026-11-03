import { z } from 'zod';

/**
 * A Calm Guardian Account's ID, which is the Supabase Auth user ID. Branded so it can't be mixed
 * up with other IDs (connected account, post, session) that are also plain strings.
 */
export const AccountIdSchema = z.uuid().brand<'AccountId'>();
export type AccountId = z.infer<typeof AccountIdSchema>;
