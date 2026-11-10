import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { renderWithQueries, stubApi } from '@/features/calm/testing';

import { LookingAfterScreen } from './looking-after-screen';

const INVITATION = { id: 'b1c2d3e4-0000-4000-8000-000000000001', from: 'dean@example.com' };
const CONNECTED = 'c1d2e3f4-0000-4000-8000-000000000001';

const person = (canTurnOn: string, calm = 'off') => ({
  guardianshipId: 'd1e2f3a4-0000-4000-8000-000000000001',
  accountEmail: 'dean@example.com',
  connectedAccounts: [
    { connectedAccountId: CONNECTED, handle: 'dean.bsky.social', calm, canTurnOn },
  ],
});

async function renderLookingAfter(
  invitations: unknown[],
  protecting: unknown[],
  routes: Parameters<typeof stubApi>[0]['routes'] = {},
) {
  const requests = stubApi({
    accounts: () => [],
    routes: {
      'GET /guardian/invitations': { body: { invitations } },
      'GET /guardian/protecting': { body: { protecting } },
      ...routes,
    },
  });
  await renderWithQueries(<LookingAfterScreen />);
  return requests;
}

afterEach(() => jest.restoreAllMocks());

describe('people you look after', () => {
  it('shows an invitation to accept', async () => {
    const requests = await renderLookingAfter([INVITATION], [], {
      [`POST /guardian/invitations/${INVITATION.id}/accept`]: { status: 204 },
    });

    expect(
      await screen.findByText('dean@example.com would like you to be one of their Guardians.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'POST',
        path: `/guardian/invitations/${INVITATION.id}/accept`,
      }),
    );
  });

  it('turns Calm Mode on for an account, after choosing how far back', async () => {
    const requests = await renderLookingAfter([], [person('yes')], {
      [`POST /guardian/connections/${CONNECTED}/calm`]: {
        status: 202,
        body: { calm: 'turning-on' },
      },
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toMatch(/can turn it off whenever they like/);
      buttons?.find((button) => button.text === 'The last 7 days')?.onPress?.();
    });

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Turn on Calm Mode for @dean.bsky.social' }),
    );

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'POST',
        path: `/guardian/connections/${CONNECTED}/calm`,
        body: { period: 'last-7-days' },
      }),
    );
  });

  it('explains, without a button, when posts are still waiting for them to review', async () => {
    await renderLookingAfter([], [person('review-waiting')]);

    expect(await screen.findByText(/hidden posts to look through first/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Turn on Calm Mode/ })).toBeNull();
  });

  it('offers no way to turn Calm Mode off', async () => {
    await renderLookingAfter([], [person('already-on', 'on')]);

    expect(await screen.findByText('Calm Mode is on')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /off/i })).toBeNull();
  });
});
