import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from './config';

function errorThrownBy(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error('Expected the action to throw an Error');
}

describe('loadConfig', () => {
  it('uses defaults when optional variables are missing', () => {
    expect(loadConfig({})).toEqual({ port: 3000, logLevel: 'info' });
  });

  it('reads the port Cloud Run provides', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  it('fails fast and names the variable when a value is invalid', () => {
    const error = errorThrownBy(() => loadConfig({ PORT: 'not-a-port' }));

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain('PORT');
  });

  it('never echoes the invalid value, which could be a secret', () => {
    const secretLookingValue = 'sk_live_do_not_log_me';

    const error = errorThrownBy(() => loadConfig({ LOG_LEVEL: secretLookingValue }));

    expect(error.message).toContain('LOG_LEVEL');
    expect(error.message).not.toContain(secretLookingValue);
  });
});
