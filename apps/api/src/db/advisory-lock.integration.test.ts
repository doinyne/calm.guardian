import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';

import { afterAll, describe, expect, it } from 'vitest';

import { connectToLocalSupabase } from '../testing/local-supabase';
import { createAdvisoryLock } from './advisory-lock';
import { createDatabase } from './database';

describe('advisory lock (local Supabase)', () => {
  const db = createDatabase(connectToLocalSupabase().databaseUrl);
  const lock = createAdvisoryLock(db);

  afterAll(async () => {
    await db.destroy();
  });

  /** Runs `fn` under the lock, recording when it starts and ends. */
  const recorded = (events: string[], name: string, label: string) =>
    lock(name, async () => {
      events.push(`${label} start`);
      await wait(100);
      events.push(`${label} end`);
      return label;
    });

  it('lets one holder at a time run under the same name, like one token refresh at a time', async () => {
    const events: string[] = [];
    const name = `refresh:${randomUUID()}`;

    const results = await Promise.all([recorded(events, name, 'A'), recorded(events, name, 'B')]);

    expect(results).toEqual(['A', 'B']);
    expect(events.join(', ')).toMatch(
      /^(A start, A end, B start, B end|B start, B end, A start, A end)$/,
    );
  });

  it('runs different names side by side', async () => {
    const events: string[] = [];

    await Promise.all([
      recorded(events, `refresh:${randomUUID()}`, 'A'),
      recorded(events, `refresh:${randomUUID()}`, 'B'),
    ]);

    expect(events.slice(0, 2).sort()).toEqual(['A start', 'B start']);
  });

  it('releases the lock when the work fails', async () => {
    const name = `refresh:${randomUUID()}`;

    await expect(lock(name, () => Promise.reject(new Error('refresh failed')))).rejects.toThrow(
      'refresh failed',
    );

    await expect(lock(name, () => 'next holder')).resolves.toBe('next holder');
  });
});
