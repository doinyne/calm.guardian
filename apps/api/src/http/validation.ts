import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

import { errorResponse } from './errors';

type ValidationResult =
  | { success: true }
  | {
      success: false;
      error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
    };

/**
 * Validates one part of the request (json, query, param, header…) against a zod schema. Every
 * route uses this, so invalid input always gets the same 400 shape. Issues name the field and the
 * problem but never echo the submitted value.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, respondToInvalidInput);
}

function respondToInvalidInput(result: ValidationResult, c: Context) {
  if (result.success) return;

  return errorResponse(c, 400, {
    code: 'validation_failed',
    message: 'Some of the information sent was missing or invalid.',
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}
