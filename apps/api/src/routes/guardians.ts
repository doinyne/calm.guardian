import { CALM_PERIOD_PRESETS, MAX_GUARDIANS, presetCalmPeriod } from '@calm-guardian/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { ConnectedAccountIdSchema } from '../connections/connected-account';
import type { GuardianshipId } from '../guardians/guardianship';
import type { createGuardianNotices } from '../guardians/guardian-notices';
import type { createGuardians } from '../guardians/guardians';
import type { Logger } from '../logger';
import { errorResponse } from '../http/errors';
import type { RequireAccount } from '../http/require-account';
import { validate } from '../http/validation';
import type { JobQueue } from '../jobs/job-queue';

export type GuardiansDependencies = {
  guardians: ReturnType<typeof createGuardians>;
  notices: Pick<ReturnType<typeof createGuardianNotices>, 'invited'>;
  jobQueue: JobQueue;
  now: () => Date;
  logger: Logger;
};

const OptOutQuerySchema = z.object({ token: z.string().min(1).max(200) });

/** A page for the opt-out link: plain, calm, and the same whether or not the link was valid. */
const OPT_OUT_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Calm Guardian</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1>You won't get these emails any more</h1>
<p>You're still a Guardian, and you can still turn on Calm Mode in the app. You can step down there at any time.</p>
</body></html>`;

const InviteBodySchema = z.object({ email: z.email().max(254) });
const IdParamsSchema = z.object({ id: z.uuid() });
const ConnectionParamsSchema = z.object({ id: ConnectedAccountIdSchema });
const PermissionBodySchema = z.object({ allowed: z.boolean() });
const GuardianTurnOnBodySchema = z.object({ period: z.enum(CALM_PERIOD_PRESETS) });

/**
 * Guardians (M6, ADR-0011). `/guardians` is the user managing theirs; `/guardian/...` is someone
 * acting as a Guardian, from their own sign-in. Nothing here shows a Guardian posts or reasons.
 */
export function guardiansRoutes({
  requireAccount,
  guardians,
  notices,
  jobQueue,
  now,
  logger,
}: GuardiansDependencies & { requireAccount: RequireAccount }) {
  const notFound = (c: Context) =>
    errorResponse(c, 404, { code: 'not_found', message: 'That invitation is no longer here.' });

  return (
    new Hono()
      // The user and their Guardians

      .get('/guardians', requireAccount, async (c) => {
        const list = await guardians.listForAccount(c.var.accountId);
        return c.json({
          guardians: list.map(({ id, guardianEmail, state }) => ({
            id,
            email: guardianEmail,
            state,
          })),
          max: MAX_GUARDIANS,
        });
      })

      .post('/guardians', requireAccount, validate('json', InviteBodySchema), async (c) => {
        if (!c.var.accountEmail) {
          return errorResponse(c, 400, {
            code: 'bad_request',
            message: 'Please sign in with an email address to invite a Guardian.',
          });
        }
        const result = await guardians.invite({
          accountId: c.var.accountId,
          accountEmail: c.var.accountEmail,
          guardianEmail: c.req.valid('json').email,
        });
        if (result.outcome === 'invited') {
          // The invitation stands even if the email doesn't go: they can still accept by signing in.
          await notices.invited(result.guardianship).catch((error: unknown) => {
            logger.error(
              { errorName: error instanceof Error ? error.name : typeof error },
              'Could not send a Guardian invitation email',
            );
          });
        }
        switch (result.outcome) {
          case 'invited':
          case 'already-invited': {
            const { id, guardianEmail, state } = result.guardianship;
            return c.json(
              { guardian: { id, email: guardianEmail, state } },
              result.outcome === 'invited' ? 201 : 200,
            );
          }
          case 'limit-reached':
            return errorResponse(c, 409, {
              code: 'guardian_limit_reached',
              message: `You can have up to ${MAX_GUARDIANS} Guardians. Remove one to invite someone new.`,
            });
          case 'yourself':
            return errorResponse(c, 400, {
              code: 'guardian_is_you',
              message: "That's your own email address. Please invite someone you trust.",
            });
        }
      })

      .delete('/guardians/:id', requireAccount, validate('param', IdParamsSchema), async (c) => {
        await guardians.remove({
          accountId: c.var.accountId,
          guardianshipId: c.req.valid('param').id as GuardianshipId,
        });
        return c.body(null, 204);
      })

      .put(
        '/connections/:id/guardians-can-turn-on',
        requireAccount,
        validate('param', ConnectionParamsSchema),
        validate('json', PermissionBodySchema),
        async (c) => {
          const changed = await guardians.setPermission({
            accountId: c.var.accountId,
            connectedAccountId: c.req.valid('param').id,
            allowed: c.req.valid('json').allowed,
          });
          return changed
            ? c.body(null, 204)
            : errorResponse(c, 404, {
                code: 'not_found',
                message: 'That account is not connected.',
              });
        },
      )

      // Acting as a Guardian

      .get('/guardian/invitations', requireAccount, async (c) => {
        const invitations = c.var.accountEmail
          ? await guardians.invitationsFor(c.var.accountEmail)
          : [];
        return c.json({
          invitations: invitations.map(({ id, accountEmail }) => ({ id, from: accountEmail })),
        });
      })

      .post(
        '/guardian/invitations/:id/accept',
        requireAccount,
        validate('param', IdParamsSchema),
        async (c) => {
          if (!c.var.accountEmail) return notFound(c);
          const result = await guardians.accept({
            guardianAccountId: c.var.accountId,
            guardianEmail: c.var.accountEmail,
            guardianshipId: c.req.valid('param').id as GuardianshipId,
          });
          return result === 'accepted' ? c.body(null, 204) : notFound(c);
        },
      )

      // Declining an invitation, or stepping down later.
      .delete(
        '/guardian/guardianships/:id',
        requireAccount,
        validate('param', IdParamsSchema),
        async (c) => {
          await guardians.stepDown({
            guardianAccountId: c.var.accountId,
            guardianEmail: c.var.accountEmail ?? '',
            guardianshipId: c.req.valid('param').id as GuardianshipId,
          });
          return c.body(null, 204);
        },
      )

      // Public: the link in a Guardian's email. The token is the proof; the page never says whether it was valid.
      .get('/guardian/emails/opt-out', validate('query', OptOutQuerySchema), async (c) => {
        await guardians.optOutOfEmails(c.req.valid('query').token);
        return c.html(OPT_OUT_PAGE);
      })

      .get('/guardian/protecting', requireAccount, async (c) =>
        c.json({ protecting: await guardians.protecting(c.var.accountId) }),
      )

      .post(
        '/guardian/connections/:id/calm',
        requireAccount,
        validate('param', ConnectionParamsSchema),
        validate('json', GuardianTurnOnBodySchema),
        async (c) => {
          const result = await guardians.turnOn({
            guardianAccountId: c.var.accountId,
            connectedAccountId: c.req.valid('param').id,
            period: presetCalmPeriod(c.req.valid('json').period, now()),
          });
          switch (result.outcome) {
            case 'started':
              await jobQueue.enqueue('activate-calm-mode', { calmSessionId: result.calmSessionId });
              return c.json({ calm: 'turning-on' as const }, 202);
            case 'already-active':
              return c.json({ calm: 'on' as const }, 200);
            case 'not-allowed':
              return errorResponse(c, 403, {
                code: 'guardian_not_allowed',
                message: "You can't turn on Calm Mode for this account.",
              });
            case 'review-waiting':
              return errorResponse(c, 409, {
                code: 'review_waiting',
                message:
                  "Calm Mode can't be turned on again until they've looked through their hidden posts.",
              });
            case 'needs-sign-in':
              return errorResponse(c, 409, {
                code: 'connection_needs_sign_in',
                message: 'This account needs to be signed in again before Calm Mode can turn on.',
              });
          }
        },
      )
  );
}
