import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { ConnectAccountScreen } from './connect-account-screen';
import type { UpcomingPlatform } from './platforms';

jest.mock('expo-web-browser', () => ({
  ...jest.requireActual<object>('expo-web-browser'),
  openAuthSessionAsync: jest.fn(),
}));
// expo-linking needs the app manifest to build our return link; tests have none.
jest.mock('expo-linking', () => ({
  ...jest.requireActual<object>('expo-linking'),
  createURL: (path: string) => `calmguardian-test://${path}`,
}));

const CONNECTED = {
  id: '6f1c2a4e-0b7d-4c1e-9a3f-2d5e8b7c6a10',
  platform: 'bluesky',
  handle: 'doinyne.bsky.social',
  status: 'active',
  connectedAt: '2026-11-03T12:00:00.000Z',
};

/** Our API, stubbed at the network edge: start a sign-in, then complete it. */
function stubApi() {
  jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith('/connections/bluesky')) {
      return Promise.resolve(
        Response.json({ authorizationUrl: 'https://bsky.social/oauth/authorize' }),
      );
    }
    if (url.endsWith('/connections/bluesky/complete')) {
      return Promise.resolve(Response.json({ connectedAccount: CONNECTED }, { status: 201 }));
    }
    return Promise.resolve(Response.json({ connectedAccounts: [] }));
  });
}

async function renderScreen({
  upcomingPlatforms = [],
  onDone = jest.fn(),
}: { upcomingPlatforms?: readonly UpcomingPlatform[]; onDone?: () => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <ConnectAccountScreen upcomingPlatforms={upcomingPlatforms} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { onDone };
}

beforeEach(() => stubApi());
afterEach(() => jest.restoreAllMocks());

describe('connect an account', () => {
  it('offers Bluesky', async () => {
    await renderScreen();

    expect(screen.getByRole('heading', { name: 'Connect an account' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Connect Bluesky' })).toBeOnTheScreen();
  });

  it('lists the Platforms that are not available yet, without a way to connect them', async () => {
    await renderScreen({ upcomingPlatforms: ['Mastodon', 'X'] });

    expect(screen.getByText('Not available yet')).toBeOnTheScreen();
    expect(screen.getByText('Mastodon')).toBeOnTheScreen();
    expect(screen.getByText('X')).toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(2); // Close, and Connect Bluesky
  });

  it('leaves out the not-available section when there is nothing to list', async () => {
    await renderScreen({ upcomingPlatforms: [] });

    expect(screen.queryByText('Not available yet')).toBeNull();
  });

  it('closes once the account is connected', async () => {
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: 'calmguardian-test://connect/bluesky?code=single-use-code',
    });
    const { onDone } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Connect Bluesky' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('stays open and explains calmly when the user stops partway through', async () => {
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
      type: WebBrowser.WebBrowserResultType.CANCEL,
    });
    const { onDone } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Connect Bluesky' }));

    await waitFor(() => expect(screen.getByText(/No account was connected/)).toBeOnTheScreen());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('closes when the user taps Close', async () => {
    const { onDone } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
