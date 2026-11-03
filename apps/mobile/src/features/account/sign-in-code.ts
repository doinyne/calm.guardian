import { z } from 'zod';

/** Matches `otp_length` in supabase/config.toml; sign-in-code.test.ts checks they agree. */
export const SIGN_IN_CODE_LENGTH = 6;

/** Supabase lets each email address ask for a new code once a minute. */
export const RESEND_CODE_AFTER_SECONDS = 60;

/** Email addresses are compared case-insensitively, so store and send them lower-cased. */
export const EmailAddressSchema = z.string().trim().toLowerCase().pipe(z.email());
