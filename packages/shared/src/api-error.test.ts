import { describe, expect, it } from 'vitest';

import { ApiErrorResponseSchema, isKnownApiErrorCode } from './api-error';

const errorBody = (code: string) => ({
  error: { code, message: 'Not found.', requestId: 'req-1' },
});

describe('ApiErrorResponseSchema', () => {
  it('accepts an error body with a known code', () => {
    expect(ApiErrorResponseSchema.safeParse(errorBody('not_found')).success).toBe(true);
  });

  it('accepts a code this app version does not know yet', () => {
    expect(ApiErrorResponseSchema.safeParse(errorBody('added_in_a_later_release')).success).toBe(
      true,
    );
  });

  it('rejects a body that is not in the error shape', () => {
    expect(ApiErrorResponseSchema.safeParse({ message: 'oops' }).success).toBe(false);
  });
});

describe('isKnownApiErrorCode', () => {
  it('recognises a code the API sends', () => {
    expect(isKnownApiErrorCode('validation_failed')).toBe(true);
  });

  it('does not recognise an unknown code', () => {
    expect(isKnownApiErrorCode('added_in_a_later_release')).toBe(false);
  });
});
