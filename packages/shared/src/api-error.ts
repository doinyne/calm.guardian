import { z } from 'zod';

/** Every error code the API sends today. */
export const API_ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthorized',
  'connection_code_invalid',
  'connection_started_elsewhere',
  'connected_elsewhere',
  'connection_has_hidden_posts',
  'connection_needs_sign_in',
  'calm_mode_still_activating',
  'calm_mode_on',
  'platform_busy',
  'guardian_limit_reached',
  'guardian_is_you',
  'guardian_not_allowed',
  'review_waiting',
  'not_found',
  'payload_too_large',
  'internal_error',
  'service_unavailable',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ValidationIssue = { path: string; message: string };

/** The one JSON shape every API error response has. */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    issues?: ValidationIssue[];
  };
};

/**
 * Parses an error response on the client. `code` is accepted as any string on purpose: old app
 * versions stay installed for months, so they must survive codes added to the API after they shipped.
 * Narrow it with `isKnownApiErrorCode`.
 */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export function isKnownApiErrorCode(code: string): code is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(code);
}
