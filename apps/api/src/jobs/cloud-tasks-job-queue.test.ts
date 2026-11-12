import { describe, expect, it, vi } from 'vitest';

import { createCloudTasksJobQueue } from './cloud-tasks-job-queue';

const SETTINGS = {
  queue: 'projects/demo/locations/europe-west2/queues/calm-guardian-jobs',
  apiUrl: new URL('https://calm-guardian-api-123.europe-west2.run.app'),
  invokerEmail: 'calm-guardian-tasks@demo.iam.gserviceaccount.com',
};
const SESSION = { calmSessionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' };

function setUp(status = 200) {
  const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status })));
  const queue = createCloudTasksJobQueue({
    settings: SETTINGS,
    accessToken: () => Promise.resolve('access-token'),
    fetchImpl,
  });
  const sent = () => {
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string) as {
      task: {
        scheduleTime?: string;
        httpRequest: {
          url: string;
          body: string;
          oidcToken: { serviceAccountEmail: string; audience: string };
        };
      };
    };
    return { url: url as string, headers: new Headers(init?.headers), task: body.task };
  };
  return { queue, sent };
}

describe('the Cloud Tasks job queue', () => {
  it('creates a task that POSTs the job back to the API, signed as our invoker', async () => {
    const { queue, sent } = setUp();

    await queue.enqueue('activate-calm-mode', SESSION);

    const { url, headers, task } = sent();
    expect(url).toBe(`https://cloudtasks.googleapis.com/v2/${SETTINGS.queue}/tasks`);
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(task.httpRequest.url).toBe(
      'https://calm-guardian-api-123.europe-west2.run.app/internal/jobs/activate-calm-mode',
    );
    expect(JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString())).toEqual(SESSION);
    expect(task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: SETTINGS.invokerEmail,
      audience: 'https://calm-guardian-api-123.europe-west2.run.app',
    });
  });

  it('schedules a job for later', async () => {
    const { queue, sent } = setUp();

    await queue.enqueue('sweep', SESSION, { runAt: new Date('2026-11-12T13:00:00.000Z') });

    expect(sent().task.scheduleTime).toBe('2026-11-12T13:00:00.000Z');
  });

  it('refuses a payload the job does not expect, before calling Google', async () => {
    const { queue } = setUp();

    await expect(queue.enqueue('sweep', { calmSessionId: 'nope' })).rejects.toThrow();
  });

  it('fails loudly when Cloud Tasks says no', async () => {
    const { queue } = setUp(403);

    await expect(queue.enqueue('sweep', SESSION)).rejects.toThrow(/403/);
  });
});
