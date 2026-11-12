import { z } from 'zod';

import { JOB_PAYLOADS, type JobQueue } from './job-queue';

/** Cloud Run's metadata server hands out the running service account's access token. */
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

const AccessTokenSchema = z.object({ access_token: z.string().min(1) });

/** An access token for calling Google APIs as the API's own service account. */
export type GoogleAccessToken = () => Promise<string>;

export function metadataServerAccessToken(fetchImpl: typeof fetch = fetch): GoogleAccessToken {
  return async () => {
    const response = await fetchImpl(METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
    });
    if (!response.ok) throw new Error(`Metadata server responded ${response.status}`);
    return AccessTokenSchema.parse(await response.json()).access_token;
  };
}

export type CloudTasksSettings = {
  /** `projects/<project>/locations/<region>/queues/<queue>` */
  queue: string;
  /** The API's own address: jobs are POSTed back to it, and it's the OIDC token's audience. */
  apiUrl: URL;
  /** The service account Cloud Tasks signs as. `/internal/*` accepts only its tokens. */
  invokerEmail: string;
};

/**
 * Jobs through Cloud Tasks (ADR-0015, ADR-0017): each one becomes a signed POST to
 * `/internal/jobs/<job>`, retried by the queue if it fails. Lets Cloud Run scale to zero, since
 * nothing waits in memory.
 */
export function createCloudTasksJobQueue({
  settings,
  accessToken,
  fetchImpl = fetch,
}: {
  settings: CloudTasksSettings;
  accessToken: GoogleAccessToken;
  fetchImpl?: typeof fetch;
}): JobQueue {
  return {
    async enqueue(job, payload, options = {}) {
      const checked = await JOB_PAYLOADS[job].parseAsync(payload);
      const task = {
        httpRequest: {
          httpMethod: 'POST',
          url: new URL(`/internal/jobs/${job}`, settings.apiUrl).href,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(checked)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: settings.invokerEmail,
            audience: settings.apiUrl.origin,
          },
        },
        ...(options.runAt ? { scheduleTime: options.runAt.toISOString() } : {}),
      };
      const response = await fetchImpl(
        `https://cloudtasks.googleapis.com/v2/${settings.queue}/tasks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ task }),
        },
      );
      if (!response.ok) throw new Error(`Cloud Tasks responded ${response.status}`);
    },
  };
}
