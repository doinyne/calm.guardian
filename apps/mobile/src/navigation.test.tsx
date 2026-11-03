import { renderRouter, screen } from 'expo-router/testing-library';

import { fakeAccountAuth } from '@/testing/app-fakes';
import { APP_ROUTES } from '@/testing/app-root';

const auth = fakeAccountAuth();

beforeEach(() => auth.reset());

// Renders the real route tree in src/app, so layout and guard mistakes show up here rather than
// on a device.
describe('navigation', () => {
  it('sends a signed-out user who opens the app to the welcome screen', async () => {
    await renderRouter(APP_ROUTES, { initialUrl: '/' });

    expect(screen).toHavePathname('/welcome');
    expect(screen.getByRole('heading', { name: 'Calm Guardian' })).toBeOnTheScreen();
  });

  it('takes a signed-in user straight into the app', async () => {
    auth.signInAs({ id: 'account-1', email: 'person@example.com' });

    await renderRouter(APP_ROUTES, { initialUrl: '/' });

    expect(screen).toHavePathname('/');
    expect(screen.getByRole('heading', { name: 'Calm Mode' })).toBeOnTheScreen();
  });

  it('keeps a signed-in user out of the sign-in screens', async () => {
    auth.signInAs({ id: 'account-1', email: 'person@example.com' });

    await renderRouter(APP_ROUTES, { initialUrl: '/sign-in' });

    expect(screen).toHavePathname('/');
  });
});
