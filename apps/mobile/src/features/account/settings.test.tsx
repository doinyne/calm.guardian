import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { APP_ROUTES } from '@/testing/app-root';
import { fakeAccountAuth } from '@/testing/app-fakes';

const auth = fakeAccountAuth();

/** Stubs the network at its edge: our API is a separate process, so this is its boundary. */
function stubApiResponse(status: number) {
  return jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status }));
}

beforeEach(() => {
  auth.reset();
  auth.signInAs({ id: 'account-1', email: 'person@example.com' });
});

afterEach(() => jest.restoreAllMocks());

async function openSettings() {
  await renderRouter(APP_ROUTES, { initialUrl: '/settings' });
}

describe('settings', () => {
  it('shows who is signed in', async () => {
    await openSettings();

    expect(screen.getByText('Signed in as person@example.com')).toBeOnTheScreen();
  });

  it('signs out of this device and returns to the welcome screen', async () => {
    await openSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen).toHavePathname('/welcome'));
  });

  describe('deleting the account', () => {
    async function confirmDeletion() {
      await openSettings();
      await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }));
    }

    it('deletes it on the server as the signed-in user, then signs out', async () => {
      const fetch = stubApiResponse(204);

      await confirmDeletion();

      await waitFor(() => expect(screen).toHavePathname('/welcome'));
      const [url, init] = fetch.mock.calls[0] ?? [];
      expect(url instanceof Request ? url.url : url?.toString()).toMatch(/\/account$/);
      expect(init?.method).toBe('DELETE');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fake-access-token');
    });

    it('does nothing when you choose to keep the account', async () => {
      const fetch = stubApiResponse(204);
      await openSettings();

      await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Keep my account' }));

      expect(fetch).not.toHaveBeenCalled();
      expect(screen).toHavePathname('/settings');
    });

    it('explains and keeps you signed in when the server could not delete it', async () => {
      stubApiResponse(500);

      await confirmDeletion();

      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't finish deleting/);
      expect(screen).toHavePathname('/settings');
    });
  });
});
