import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { CalmHome } from './calm-home';
import { aCalmAccount, calmSession, renderWithQueries, stubApi } from './testing';
import type { CalmAccount } from './use-calm';

const ME = aCalmAccount();

async function renderHome(
  accounts: () => CalmAccount[],
  routes: Parameters<typeof stubApi>[0]['routes'] = {},
) {
  const requests = stubApi({ accounts, routes });
  const onTurnOn = jest.fn();
  const onConnect = jest.fn();
  await renderWithQueries(
    <CalmHome
      onTurnOn={onTurnOn}
      onConnect={onConnect}
      onReview={jest.fn()}
      onGuardians={jest.fn()}
      onLookingAfter={jest.fn()}
    />,
  );
  return { requests, onTurnOn, onConnect };
}

/** Presses the confirming button of the next native alert. */
function confirmAlerts(buttonText: string) {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.text === buttonText)?.onPress?.();
  });
}

afterEach(() => jest.restoreAllMocks());

describe('home: Calm Mode at a glance', () => {
  it('shows Calm Mode is off, with a way to turn it on for each account', async () => {
    const { onTurnOn } = await renderHome(() => [ME]);

    // Wait for the account itself: "off" also shows while the accounts are still loading.
    expect(await screen.findByText('Bluesky · Standing by')).toBeOnTheScreen();
    expect(screen.getByText('Calm Mode is off')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn on Calm Mode for @doinyne.bsky.social' }),
    );

    expect(onTurnOn).toHaveBeenCalledWith({ connectedAccountId: ME.id });
  });

  it('offers to turn it on for all accounts when there is more than one', async () => {
    const work = aCalmAccount({
      id: 'b8a1c2d3-0000-4000-8000-000000000002',
      handle: 'work.bsky.social',
    });
    const { onTurnOn } = await renderHome(() => [ME, work]);

    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on for all' }));

    expect(onTurnOn).toHaveBeenCalledWith('all');
  });

  it('shows progress while posts are being hidden, and why Turn off has to wait', async () => {
    await renderHome(() => [aCalmAccount({ calm: calmSession('activating', 12) })]);

    expect(await screen.findByText('Calm Mode is turning on')).toBeOnTheScreen();
    expect(screen.getByText('Hiding posts, newest first · 12 hidden')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Turn off Calm Mode for @doinyne.bsky.social' }),
    ).toBeDisabled();
    expect(
      screen.getByText('You can turn Calm Mode off once hiding has finished.'),
    ).toBeOnTheScreen();
  });

  it('explains when Bluesky needs the user to sign in again to finish', async () => {
    const { onConnect } = await renderHome(() => [
      aCalmAccount({ status: 'needs_reauth', calm: calmSession('activating', 3) }),
    ]);

    expect(await screen.findByText(/needs you to sign in again/)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Sign in to @doinyne.bsky.social again' }),
    );

    expect(onConnect).toHaveBeenCalled();
  });

  it('turns Calm Mode off after a calm confirmation, keeping posts hidden', async () => {
    let calm: CalmAccount['calm'] = calmSession('active', 12);
    const { requests } = await renderHome(() => [aCalmAccount({ calm })], {
      [`DELETE /connections/${ME.id}/calm`]: { status: 204 },
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toMatch(/12 posts stay safely backed up and hidden/);
      calm = null;
      buttons?.find((button) => button.text === 'Turn off')?.onPress?.();
    });

    expect(await screen.findByText('Calm Mode is on')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn off Calm Mode for @doinyne.bsky.social' }),
    );

    await waitFor(() => expect(screen.getByText('Calm Mode is off')).toBeOnTheScreen());
    expect(requests).toContainEqual({ method: 'DELETE', path: `/connections/${ME.id}/calm` });
  });

  it('keeps Calm Mode on if the user changes their mind', async () => {
    const { requests } = await renderHome(() => [aCalmAccount({ calm: calmSession('active', 1) })]);
    confirmAlerts('Keep it on');

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Turn off Calm Mode for @doinyne.bsky.social' }),
    );

    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it("explains that an account with hidden posts can't be disconnected yet", async () => {
    await renderHome(() => [ME], {
      [`DELETE /connections/${ME.id}`]: {
        status: 409,
        body: { error: { code: 'connection_has_hidden_posts', message: '' } },
      },
    });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Disconnect @doinyne.bsky.social' }),
    );

    expect(await screen.findByText(/This account has hidden posts/)).toBeOnTheScreen();
  });

  it('invites the user to connect an account when there are none', async () => {
    const { onConnect } = await renderHome(() => []);

    await fireEvent.press(await screen.findByRole('button', { name: 'Connect an account' }));

    expect(onConnect).toHaveBeenCalled();
  });

  it('offers Review as soon as Calm Mode is turned off, without reopening the app', async () => {
    // Home opened before anything was hidden; Calm Mode then hid two posts in the background.
    let calm: CalmAccount['calm'] = calmSession('active', 2);
    let hiddenPosts: unknown[] = [];
    await renderHome(() => [aCalmAccount({ calm })], {
      [`DELETE /connections/${ME.id}/calm`]: { status: 204 },
      'GET /review': () => ({
        body: { posts: hiddenPosts, more: false, toReview: hiddenPosts.length },
      }),
    });
    expect(await screen.findByText('Calm Mode is on')).toBeOnTheScreen();
    hiddenPosts = [aReviewPost('one'), aReviewPost('two')];
    confirmAlerts('Turn off');
    calm = null;

    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn off Calm Mode for @doinyne.bsky.social' }),
    );

    expect(await screen.findByRole('button', { name: 'Review hidden posts' })).toBeOnTheScreen();
    expect(screen.getByText(/2 hidden posts are waiting for you/)).toBeOnTheScreen();
  });

  it("doesn't nudge towards Review while Calm Mode is still on for those posts", async () => {
    await renderHome(() => [aCalmAccount({ calm: calmSession('active', 1) })], {
      'GET /review': { body: { posts: [aReviewPost('one')], more: false, toReview: 1 } },
    });

    expect(await screen.findByText('Calm Mode is on')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Review hidden posts' })).toBeNull();
  });
});

describe('home without a connection', () => {
  it("says calmly that it's offline, and that Calm Mode keeps working", async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQueries(
      <CalmHome
        onTurnOn={jest.fn()}
        onConnect={jest.fn()}
        onReview={jest.fn()}
        onGuardians={jest.fn()}
        onLookingAfter={jest.fn()}
      />,
    );

    expect(await screen.findByText(/Calm Mode keeps working on our side/)).toBeOnTheScreen();
    expect(screen.queryByText(/couldn't load your accounts/)).toBeNull();
  });
});

describe('home and Guardians', () => {
  it('says which Guardian turned Calm Mode on', async () => {
    await renderHome(() => [
      aCalmAccount({
        calm: { ...calmSession('active', 3), startedByGuardian: 'alex@example.com' },
      }),
    ]);

    expect(
      await screen.findByText('Calm Mode on · 3 hidden · turned on by alex@example.com'),
    ).toBeOnTheScreen();
  });

  it('offers to change what that Guardian can do when turning it off', async () => {
    await renderHome(() => [
      aCalmAccount({
        calm: { ...calmSession('active', 3), startedByGuardian: 'alex@example.com' },
      }),
    ]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Turn off Calm Mode for @doinyne.bsky.social' }),
    );

    const buttons = alert.mock.calls[0]?.[2]?.map((button) => button.text);
    expect(buttons).toContain('Turn off and change what alex@example.com can do');
  });

  it("shows an invitation to be someone else's Guardian", async () => {
    await renderHome(() => [ME], {
      'GET /guardian/invitations': {
        body: { invitations: [{ id: 'i1', from: 'sam@example.com' }] },
      },
    });

    expect(
      await screen.findByText('sam@example.com would like you to be one of their Guardians.'),
    ).toBeOnTheScreen();
  });
});

function aReviewPost(id: string) {
  return {
    id,
    connectedAccountId: ME.id,
    state: 'to-review',
    text: 'A hidden post',
    isReply: false,
    postedAt: '2026-11-04T09:00:00.000Z',
    hiddenAt: '2026-11-04T12:00:00.000Z',
    files: [],
  };
}
