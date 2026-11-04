import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { summarisePost } from '../bluesky/post-summary';
import type { ArchivedPostId, ReviewArchive, ReviewItem } from '../calm/archive';
import { ConnectedAccountNotFoundError } from '../calm/calm-mode';
import { ArchivedPostNotFoundError, type createRestore } from '../calm/restore';
import { ConnectedAccountIdSchema } from '../connections/connected-account';
import { errorResponse } from '../http/errors';
import type { RequireAccount } from '../http/require-account';
import { validate } from '../http/validation';
import type { JobQueue } from '../jobs/job-queue';

export type ReviewDependencies = {
  restore: Pick<
    ReturnType<typeof createRestore>,
    'restore' | 'keepHidden' | 'deleteForGood' | 'canRestoreAll'
  >;
  archive: Pick<ReviewArchive, 'listHidden' | 'countToReview'>;
  jobQueue: JobQueue;
};

/** Review shows this many posts at a time. */
const REVIEW_PAGE_SIZE = 100;

const ArchivedPostParamsSchema = z.object({ id: z.uuid() });
const ConnectionParamsSchema = z.object({ id: ConnectedAccountIdSchema });

/**
 * Review and Restore (M5): the user's hidden posts, and what to do with each. Only the Account that
 * owns a post ever sees it; Guardians never do (product rule 3).
 */
export function reviewRoutes({
  requireAccount,
  restore,
  archive,
  jobQueue,
}: ReviewDependencies & { requireAccount: RequireAccount }) {
  const notFound = (c: Context) =>
    errorResponse(c, 404, { code: 'not_found', message: 'That post is no longer here.' });
  const calmModeOn = (c: Context) =>
    errorResponse(c, 409, {
      code: 'calm_mode_on',
      message: 'Calm Mode is on for this account. Turn it off to bring posts back.',
    });
  const needsSignIn = (c: Context) =>
    errorResponse(c, 409, {
      code: 'connection_needs_sign_in',
      message: 'Please sign in to this account again, then try once more.',
    });

  /** Runs a Review action on one post; a post that isn't the Account's is simply not found. */
  async function onPost<Result>(c: Context, action: () => Promise<Result>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof ArchivedPostNotFoundError) return notFound(c);
      throw error;
    }
  }

  return (
    new Hono()
      .get('/review', requireAccount, async (c) => {
        const { items, more } = await archive.listHidden({
          accountId: c.var.accountId,
          limit: REVIEW_PAGE_SIZE,
        });
        return c.json({
          posts: items.map(toReviewResponse),
          more,
          toReview: await archive.countToReview(c.var.accountId),
        });
      })

      .post(
        '/review/:id/restore',
        requireAccount,
        validate('param', ArchivedPostParamsSchema),
        async (c) => {
          const archivedPostId = c.req.valid('param').id as ArchivedPostId;
          const result = await onPost(c, () =>
            restore.restore({ accountId: c.var.accountId, archivedPostId }),
          );
          if (result instanceof Response) return result;
          switch (result.outcome) {
            case 'restored':
            case 'already-restored':
              return c.json({ outcome: result.outcome });
            case 'calm-mode-on':
              return calmModeOn(c);
            case 'needs-sign-in':
              return needsSignIn(c);
            case 'waiting':
              return errorResponse(c, 429, {
                code: 'platform_busy',
                message: 'Bluesky asked us to slow down. Please try again in a few minutes.',
              });
          }
        },
      )

      .post(
        '/review/:id/keep-hidden',
        requireAccount,
        validate('param', ArchivedPostParamsSchema),
        async (c) => {
          const archivedPostId = c.req.valid('param').id as ArchivedPostId;
          const result = await onPost(c, () =>
            restore.keepHidden({ accountId: c.var.accountId, archivedPostId }),
          );
          return result instanceof Response ? result : c.body(null, 204);
        },
      )

      .delete(
        '/review/:id',
        requireAccount,
        validate('param', ArchivedPostParamsSchema),
        async (c) => {
          const archivedPostId = c.req.valid('param').id as ArchivedPostId;
          const result = await onPost(c, () =>
            restore.deleteForGood({ accountId: c.var.accountId, archivedPostId }),
          );
          return result instanceof Response ? result : c.body(null, 204);
        },
      )

      // Restore all for one connected account runs in the background (ADR-0015): a big archive takes
      // hours at Bluesky's rate limits.
      .post(
        '/connections/:id/restore-all',
        requireAccount,
        validate('param', ConnectionParamsSchema),
        async (c) => {
          const connectedAccountId = c.req.valid('param').id;
          let check;
          try {
            check = await restore.canRestoreAll({ accountId: c.var.accountId, connectedAccountId });
          } catch (error) {
            if (error instanceof ConnectedAccountNotFoundError) {
              return errorResponse(c, 404, {
                code: 'not_found',
                message: 'That account is not connected.',
              });
            }
            throw error;
          }
          if (check === 'calm-mode-on') return calmModeOn(c);
          if (check === 'needs-sign-in') return needsSignIn(c);

          await jobQueue.enqueue('restore-all', { accountId: c.var.accountId, connectedAccountId });
          return c.body(null, 202);
        },
      )
  );
}

/** What the app shows: the post's own words and when, never its Platform identifiers. */
function toReviewResponse({ id, connectedAccountId, state, post, hiddenAt }: ReviewItem) {
  const { text, isReply } = summarisePost(post.record);
  return {
    id,
    connectedAccountId,
    state,
    text,
    isReply,
    postedAt: post.createdAt.toISOString(),
    hiddenAt: hiddenAt.toISOString(),
    files: post.media.map(({ mimeType }) => mimeType),
  };
}
