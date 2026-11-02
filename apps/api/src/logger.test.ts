import { describe, expect, it } from 'vitest';

import { captureLogs } from './testing/log-capture';

const SECRET = 'super-secret-value';

describe('createLogger', () => {
  it('writes Cloud Logging fields', () => {
    const logs = captureLogs();

    logs.logger.warn('disk nearly full');

    expect(logs.entries()[0]).toMatchObject({ severity: 'WARNING', message: 'disk nearly full' });
  });

  it.each([
    ['a top-level key', { password: SECRET }],
    ['a nested key', { credentials: { accessToken: SECRET } }],
    ['a doubly nested key', { request: { headers: { authorization: `Bearer ${SECRET}` } } }],
  ])('redacts a sensitive value under %s', (_description, payload) => {
    const logs = captureLogs();

    logs.logger.info(payload, 'something happened');

    expect(logs.output()).not.toContain(SECRET);
    expect(logs.output()).toContain('[REDACTED]');
  });
});
