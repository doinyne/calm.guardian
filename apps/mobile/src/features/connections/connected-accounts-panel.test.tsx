import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConnectedAccountsPanel } from './connected-accounts-panel';

const ME = {
  id: '6f1c2a4e-0b7d-4c1e-9a3f-2d5e8b7c6a10',
  platform: 'bluesky',
  handle: 'doinyne.bsky.social',
  status: 'active',
  connectedAt: '2026-11-03T12:00:00.000Z',
};

/** Our API, stubbed at the network edge, with the connected accounts it currently holds. */
function stubApi(initial: (typeof ME)[]) {
  let accounts = initial;
  const requests: string[] = [];
  jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${new URL(url).pathname}`);
    if (method === 'DELETE') {
      accounts = [];
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(Response.json({ connectedAccounts: accounts }));
  });
  return requests;
}

async function renderPanel({ onConnectPress = jest.fn() }: { onConnectPress?: () => void } = {}) {
  // No retries, and no garbage-collection timers left running to keep Jest from exiting.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <ConnectedAccountsPanel onConnectPress={onConnectPress} />
    </QueryClientProvider>,
  );
  return { onConnectPress };
}

afterEach(() => jest.restoreAllMocks());

describe('connected accounts panel', () => {
  it('lists each connected account with its status', async () => {
    stubApi([ME]);

    await renderPanel();

    expect(await screen.findByText('@doinyne.bsky.social')).toBeOnTheScreen();
    expect(screen.getByText('Bluesky · Connected')).toBeOnTheScreen();
  });

  it('says when nothing is connected yet, and offers to connect an account', async () => {
    stubApi([]);
    const { onConnectPress } = await renderPanel();

    expect(await screen.findByText('No accounts connected yet.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Connect an account' }));

    expect(onConnectPress).toHaveBeenCalledTimes(1);
  });

  it('offers to connect another account once one is connected', async () => {
    stubApi([ME]);

    await renderPanel();

    expect(
      await screen.findByRole('button', { name: 'Connect another account' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Connect an account' })).toBeNull();
  });

  it('disconnects an account and refreshes the list', async () => {
    const requests = stubApi([ME]);
    await renderPanel();

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Disconnect @doinyne.bsky.social' }),
    );

    expect(await screen.findByText('No accounts connected yet.')).toBeOnTheScreen();
    expect(requests).toContain(`DELETE /connections/${ME.id}`);
  });
});
