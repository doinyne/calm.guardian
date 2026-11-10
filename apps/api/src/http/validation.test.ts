import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildTestApp } from '../testing/test-app';
import { validate } from './validation';

const GuardianInviteSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
});

function buildAppWithValidatedRoute() {
  const { app } = buildTestApp();
  app.post('/validation-example', validate('json', GuardianInviteSchema), (c) =>
    c.json(c.req.valid('json'), 201),
  );
  return app;
}

function postJson(body: string) {
  return buildAppWithValidatedRoute().request('/validation-example', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('validate', () => {
  it('passes valid input through to the handler, typed', async () => {
    const response = await postJson(JSON.stringify({ name: 'Sam', email: 'sam@example.com' }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ name: 'Sam', email: 'sam@example.com' });
  });

  it('responds 400 naming each invalid field', async () => {
    const response = await postJson(JSON.stringify({ name: '', email: 'not-an-email' }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.issues.map((issue) => issue.path)).toEqual(['name', 'email']);
  });

  it('never echoes the submitted values back', async () => {
    const response = await postJson(JSON.stringify({ name: '', email: 'private@nope' }));

    await expect(response.text()).resolves.not.toContain('private@nope');
  });

  it('responds 400 bad_request when the body is not JSON at all', async () => {
    const response = await postJson('{ not json');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'bad_request' } });
  });
});
