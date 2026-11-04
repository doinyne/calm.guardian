import { CALM_PERIOD_PRESETS, presetCalmPeriod } from '@calm-guardian/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import {
  ConnectedAccountNotFoundError,
  type CalmStatus,
  type createCalmMode,
  type StartResult,
} from '../calm/calm-mode';
import { ConnectedAccountIdSchema } from '../connections/connected-account';
import { errorResponse } from '../http/errors';
import type { RequireAccount } from '../http/require-account';
import { validate } from '../http/validation';
import type { JobQueue } from '../jobs/job-queue';

export type CalmDependencies = {
  calmMode: Pick<ReturnType<typeof createCalmMode>, 'start' | 'preview' | 'turnOff' | 'status'>;
  jobQueue: JobQueue;
  now: () => Date;
};

/** Presets only for now; custom periods come with the app's date picker (the core accepts them). */
const PeriodBodySchema = z.object({ period: z.enum(CALM_PERIOD_PRESETS) });
const ConnectionParamsSchema = z.object({ id: ConnectedAccountIdSchema });

/**
 * Calm Mode (M3). The server owns its state (product rule 5): the app sends what the user chose, and
 * reads back what's true. Turning on starts a background job (ADR-0015) and answers at once.
 */
export function calmRoutes({
  requireAccount,
  calmMode,
  jobQueue,
  now,
}: CalmDependencies & { requireAccount: RequireAccount }) {
  /** Queues the work for a Calm session that's activating; reports what the app needs to know. */
  async function startedResponse(started: StartResult) {
    if (started.outcome === 'started') {
      await jobQueue.enqueue('activate-calm-mode', { calmSessionId: started.calmSessionId });
      return { calmSessionId: started.calmSessionId, state: 'activating' as const };
    }
    if (started.outcome === 'already-active') {
      return { calmSessionId: started.calmSessionId, state: 'active' as const };
    }
    return null;
  }

  const notFound = (c: Context) =>
    errorResponse(c, 404, { code: 'not_found', message: 'That account is not connected.' });

  return (
    new Hono()
      .get('/calm', requireAccount, async (c) => {
        const statuses = await calmMode.status(c.var.accountId);
        return c.json({ connectedAccounts: statuses.map(toStatusResponse) });
      })

      .post(
        '/connections/:id/calm/preview',
        requireAccount,
        validate('param', ConnectionParamsSchema),
        validate('json', PeriodBodySchema),
        async (c) => {
          try {
            const preview = await calmMode.preview({
              accountId: c.var.accountId,
              connectedAccountId: c.req.valid('param').id,
              period: presetCalmPeriod(c.req.valid('json').period, now()),
            });
            return c.json(preview);
          } catch (error) {
            if (error instanceof ConnectedAccountNotFoundError) return notFound(c);
            throw error;
          }
        },
      )

      .post(
        '/connections/:id/calm',
        requireAccount,
        validate('param', ConnectionParamsSchema),
        validate('json', PeriodBodySchema),
        async (c) => {
          let started;
          try {
            started = await calmMode.start({
              accountId: c.var.accountId,
              connectedAccountId: c.req.valid('param').id,
              period: presetCalmPeriod(c.req.valid('json').period, now()),
            });
          } catch (error) {
            if (error instanceof ConnectedAccountNotFoundError) return notFound(c);
            throw error;
          }

          const calm = await startedResponse(started);
          if (!calm) {
            return errorResponse(c, 409, {
              code: 'connection_needs_sign_in',
              message: 'Please sign in to this account again, then turn on Calm Mode.',
            });
          }
          return c.json({ calm }, calm.state === 'activating' ? 202 : 200);
        },
      )

      // "Turn on for all": every connected account that can be protected.
      .post('/calm', requireAccount, validate('json', PeriodBodySchema), async (c) => {
        const period = presetCalmPeriod(c.req.valid('json').period, now());
        const results = [];
        for (const { connectedAccount } of await calmMode.status(c.var.accountId)) {
          const started = await calmMode.start({
            accountId: c.var.accountId,
            connectedAccountId: connectedAccount.id,
            period,
          });
          results.push({
            connectedAccountId: connectedAccount.id,
            calm: await startedResponse(started),
          });
        }
        return c.json({ connectedAccounts: results }, 202);
      })

      .delete(
        '/connections/:id/calm',
        requireAccount,
        validate('param', ConnectionParamsSchema),
        async (c) => {
          let result;
          try {
            result = await calmMode.turnOff({
              accountId: c.var.accountId,
              connectedAccountId: c.req.valid('param').id,
            });
          } catch (error) {
            if (error instanceof ConnectedAccountNotFoundError) return notFound(c);
            throw error;
          }
          if (result === 'still-activating') {
            return errorResponse(c, 409, {
              code: 'calm_mode_still_activating',
              message:
                'Calm Mode is still hiding posts. You can turn it off as soon as that has finished.',
            });
          }
          return c.body(null, 204);
        },
      )
  );
}

/** What the app sees: no Platform IDs, dates as ISO strings. */
function toStatusResponse({ connectedAccount, calm }: CalmStatus) {
  return {
    id: connectedAccount.id,
    platform: connectedAccount.platform,
    handle: connectedAccount.handle,
    status: connectedAccount.status,
    calm: calm && {
      calmSessionId: calm.calmSessionId,
      state: calm.state,
      period: { from: calm.period.from?.toISOString() ?? null, to: calm.period.to.toISOString() },
      startedAt: calm.startedAt.toISOString(),
      hidden: calm.hidden,
    },
  };
}
