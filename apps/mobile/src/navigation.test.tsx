import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

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
    expect(screen.getByRole('heading', { name: "You're in control." })).toBeOnTheScreen();
  });

  it('takes a signed-in user straight into the app', async () => {
    auth.signInAs({ id: 'account-1', email: 'person@example.com' });

    await renderRouter(APP_ROUTES, { initialUrl: '/' });

    expect(screen).toHavePathname('/');
    expect(screen.getByRole('heading', { name: 'Calm Mode is off' })).toBeOnTheScreen();
  });

  it('keeps a signed-in user out of the sign-in screens', async () => {
    auth.signInAs({ id: 'account-1', email: 'person@example.com' });

    await renderRouter(APP_ROUTES, { initialUrl: '/sign-in' });

    expect(screen).toHavePathname('/');
  });

  it('opens Connect an account from home', async () => {
    auth.signInAs({ id: 'account-1', email: 'person@example.com' });
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ connectedAccounts: [] }));
    await renderRouter(APP_ROUTES, { initialUrl: '/' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Connect an account' }));

    expect(screen).toHavePathname('/connect');
    expect(screen.getByRole('heading', { name: 'Connect an account' })).toBeOnTheScreen();
  });

  it('opens Support from the welcome screen, before signing in', async () => {
    await renderRouter(APP_ROUTES, { initialUrl: '/' });

    await fireEvent.press(screen.getByRole('link', { name: 'Need to talk to someone now?' }));

    expect(screen).toHavePathname('/support');
    expect(screen.getByText("You don't have to go through it alone")).toBeOnTheScreen();
  });

  it('opens Support after signing in too', async () => {
    auth.signInAs({ id: 'account-1', email: 'person@example.com' });

    await renderRouter(APP_ROUTES, { initialUrl: '/support' });

    expect(screen).toHavePathname('/support');
  });

  it('explains how it works before asking for an email address', async () => {
    await renderRouter(APP_ROUTES, { initialUrl: '/' });

    await fireEvent.press(screen.getByRole('link', { name: 'Get started' }));

    expect(screen).toHavePathname('/how-it-works');
    await fireEvent.press(screen.getByRole('link', { name: 'Continue with email' }));
    expect(screen).toHavePathname('/sign-in');
  });
});
