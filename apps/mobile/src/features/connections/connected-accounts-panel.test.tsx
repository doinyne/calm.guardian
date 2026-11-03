import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { ConnectedAccountsPanel } from './connected-accounts-panel';

jest.mock('expo-web-browser', () => ({
  ...jest.requireActual<object>('expo-web-browser'),
  openAuthSessionAsync: jest.fn(),
}));
// expo-linking needs the app manifest to build our return link; tests have none.
jest.mock('expo-linking', () => ({
  ...jest.requireActual<object>('expo-linking'),
  createURL: (path: string) => `calmguardian-test://${path}`,
}));

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
    if (url.endsWith('/connections/bluesky')) {
      return Promise.resolve(
        Response.json({ authorizationUrl: 'https://bsky.social/oauth/authorize' }),
      );
    }
    return Promise.resolve(Response.json({ connectedAccounts: accounts }));
  });
  return requests;
}

async function renderPanel() {
  // No retries, and no garbage-collection timers left running to keep Jest from exiting.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <ConnectedAccountsPanel />
    </QueryClientProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

describe('connected accounts panel', () => {
  it('lists each connected account with its status', async () => {
    stubApi([ME]);

    await renderPanel();

    expect(await screen.findByText('@doinyne.bsky.social')).toBeOnTheScreen();
    expect(screen.getByText('Bluesky · Connected')).toBeOnTheScreen();
  });

  it('says when nothing is connected yet', async () => {
    stubApi([]);

    await renderPanel();

    expect(await screen.findByText('No accounts connected yet.')).toBeOnTheScreen();
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

  it('explains calmly when the user stops partway through connecting', async () => {
    stubApi([]);
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: WebBrowser.WebBrowserResultType.CANCEL,
    });
    await renderPanel();

    await fireEvent.press(await screen.findByRole('button', { name: 'Connect Bluesky' }));

    await waitFor(() => expect(screen.getByText(/No account was connected/)).toBeOnTheScreen());
  });
});
