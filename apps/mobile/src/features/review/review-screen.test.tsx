import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { aCalmAccount, renderWithQueries, stubApi } from '@/features/calm/testing';

import { ReviewScreen } from './review-screen';

const ACCOUNT = aCalmAccount();
const POST_ID = 'c1d2e3f4-0000-4000-8000-000000000001';

type ReviewPostBody = {
  id: string;
  connectedAccountId: string;
  state: 'to-review' | 'kept-hidden';
  text: string;
  isReply: boolean;
  postedAt: string;
  hiddenAt: string;
  files: string[];
};

const aHiddenPost = (overrides: Partial<ReviewPostBody> = {}): ReviewPostBody => ({
  id: POST_ID,
  connectedAccountId: ACCOUNT.id,
  state: 'to-review',
  text: 'A post from a hard week',
  isReply: false,
  postedAt: '2026-11-03T09:00:00.000Z',
  hiddenAt: '2026-11-04T12:00:00.000Z',
  files: ['image/jpeg', 'image/jpeg'],
  ...overrides,
});

/** Our API with these hidden posts; actions change what `GET /review` returns next. */
async function renderReview(
  initial: ReviewPostBody[],
  routes: Record<string, { status?: number; body?: unknown }> = {},
) {
  let posts = initial;
  const requests = stubApi({
    accounts: () => [ACCOUNT],
    routes: {
      ...routes,
      'GET /review': () => ({
        body: {
          posts,
          more: false,
          toReview: posts.filter((post) => post.state === 'to-review').length,
        },
      }),
    },
  });
  await renderWithQueries(<ReviewScreen />);
  return { requests, setPosts: (next: ReviewPostBody[]) => (posts = next) };
}

afterEach(() => jest.restoreAllMocks());

describe('Review', () => {
  it('shows each hidden post in its own words, with when it was posted and its files', async () => {
    await renderReview([aHiddenPost({ isReply: true })]);

    expect(await screen.findByText('A post from a hard week')).toBeOnTheScreen();
    expect(screen.getByText(/Reply · 2 images$/)).toBeOnTheScreen();
    expect(screen.getByText('To review · 1')).toBeOnTheScreen();
  });

  it('says so kindly when there is nothing to review', async () => {
    await renderReview([]);

    expect(await screen.findByText(/Nothing to review/)).toBeOnTheScreen();
  });

  it('brings a post back', async () => {
    const { requests, setPosts } = await renderReview([aHiddenPost()], {
      [`POST /review/${POST_ID}/restore`]: { body: { outcome: 'restored' } },
    });

    setPosts([]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Bring back' }));

    await waitFor(() => expect(screen.getByText(/Nothing to review/)).toBeOnTheScreen());
    expect(requests).toContainEqual({ method: 'POST', path: `/review/${POST_ID}/restore` });
  });

  it('explains when Calm Mode is still on for that account', async () => {
    await renderReview([aHiddenPost()], {
      [`POST /review/${POST_ID}/restore`]: {
        status: 409,
        body: { error: { code: 'calm_mode_on', message: '' } },
      },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Bring back' }));

    expect(await screen.findByText(/Turn it off to bring posts back/)).toBeOnTheScreen();
  });

  it('keeps a post hidden, moving it out of the posts to review', async () => {
    const { setPosts } = await renderReview([aHiddenPost()], {
      [`POST /review/${POST_ID}/keep-hidden`]: { status: 204 },
    });

    setPosts([aHiddenPost({ state: 'kept-hidden' })]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Keep hidden' }));

    expect(await screen.findByText('Kept hidden · 1')).toBeOnTheScreen();
    expect(screen.queryByText(/To review/)).toBeNull();
  });

  it('deletes a post for good only after a clear confirmation', async () => {
    const { requests } = await renderReview([aHiddenPost()], {
      [`DELETE /review/${POST_ID}`]: { status: 204 },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toMatch(/can't be undone/);
      buttons?.find((button) => button.text === 'Delete for good')?.onPress?.();
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete for good' }));

    await waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: `/review/${POST_ID}` }),
    );
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('brings back everything for an account in the background', async () => {
    const { requests } = await renderReview([aHiddenPost()], {
      [`POST /connections/${ACCOUNT.id}/restore-all`]: { status: 202 },
    });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Bring back all posts for @doinyne.bsky.social' }),
    );

    expect(await screen.findByText(/Bringing your posts back, oldest first/)).toBeOnTheScreen();
    expect(requests).toContainEqual({
      method: 'POST',
      path: `/connections/${ACCOUNT.id}/restore-all`,
    });
  });
});
