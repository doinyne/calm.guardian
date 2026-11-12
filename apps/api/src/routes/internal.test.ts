import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createGoogleCallerVerifier } from '../internal/google-caller';
import { createGoogleTokenIssuer, TEST_API_AUDIENCE, TEST_INVOKER } from '../testing/google-tokens';
import { NO_JOB_HANDLERS } from '../testing/no-job-handlers';
import { buildTestApp } from '../testing/test-app';

const SESSION = { calmSessionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' };

describe('internal routes (Cloud Tasks and Scheduler)', () => {
  let google: Awaited<ReturnType<typeof createGoogleTokenIssuer>>;

  beforeAll(async () => {
    google = await createGoogleTokenIssuer();
  });

  function setUp(activate = vi.fn(() => Promise.resolve())) {
    const queueSweeps = vi.fn(() => Promise.resolve());
    const { app } = buildTestApp({
      internal: {
        verifyGoogleCaller: createGoogleCallerVerifier({
          keys: google.keys,
          audience: TEST_API_AUDIENCE,
          invokerEmail: TEST_INVOKER,
        }),
        handlers: () => ({ ...NO_JOB_HANDLERS, 'activate-calm-mode': activate }),
        queueSweeps,
      },
    });
    const post = async (path: string, body: unknown, token?: string) =>
      app.request(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token === undefined
            ? { authorization: `Bearer ${await google.issue()}` }
            : token
              ? { authorization: `Bearer ${token}` }
              : {}),
        },
        body: JSON.stringify(body),
      });
    return { post, activate, queueSweeps };
  }

  it('runs a job Cloud Tasks delivers', async () => {
    const { post, activate } = setUp();

    const response = await post('/internal/jobs/activate-calm-mode', SESSION);

    expect(response.status).toBe(204);
    expect(activate).toHaveBeenCalledWith(SESSION);
  });

  it('answers 500 when the job fails, so Cloud Tasks retries it', async () => {
    const { post } = setUp(vi.fn(() => Promise.reject(new Error('database unavailable'))));

    expect((await post('/internal/jobs/activate-calm-mode', SESSION)).status).toBe(500);
  });

  it('refuses anyone without a token Google signed for our invoker', async () => {
    const { post, activate } = setUp();

    const noToken = await post('/internal/jobs/activate-calm-mode', SESSION, '');
    const someoneElse = await post(
      '/internal/jobs/activate-calm-mode',
      SESSION,
      await google.issue({ email: 'intruder@other.iam.gserviceaccount.com' }),
    );

    expect([noToken.status, someoneElse.status]).toEqual([401, 401]);
    expect(activate).not.toHaveBeenCalled();
  });

  it('drops a payload that could never be right, rather than retrying it forever', async () => {
    const { post, activate } = setUp();

    expect(
      (await post('/internal/jobs/activate-calm-mode', { calmSessionId: 'nope' })).status,
    ).toBe(204);
    expect(activate).not.toHaveBeenCalled();
  });

  it('starts the Sweep for Cloud Scheduler', async () => {
    const { post, queueSweeps } = setUp();

    expect((await post('/internal/sweep', {})).status).toBe(204);
    expect(queueSweeps).toHaveBeenCalled();
  });

  it("isn't there at all when running locally", async () => {
    const { app } = buildTestApp();

    expect((await app.request('/internal/sweep', { method: 'POST' })).status).toBe(404);
  });
});
