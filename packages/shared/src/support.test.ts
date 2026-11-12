import { describe, expect, it } from 'vitest';

import { supportFor } from './support';

describe('support for where you are', () => {
  it('gives the UK Samaritans, Shout and 999', () => {
    const uk = supportFor('GB');

    expect(uk.emergency).toBe('999');
    expect(uk.lines.map((line) => line.name)).toEqual(['Samaritans', 'Shout']);
  });

  it('ignores letter case', () => {
    expect(supportFor('us').emergency).toBe('911');
  });

  it('falls back to 112 and no local lines when the region is unknown or missing', () => {
    expect(supportFor('ZZ')).toEqual({ emergency: '112', lines: [] });
    expect(supportFor(undefined)).toEqual({ emergency: '112', lines: [] });
  });

  it('only lists lines that can be called or texted', () => {
    for (const region of ['GB', 'IE', 'US', 'CA', 'AU']) {
      for (const line of supportFor(region).lines) {
        expect(line.call ?? line.text).toBeDefined();
      }
    }
  });
});
