import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { SignInError } from '@/account/account-auth';
import { APP_ROUTES } from '@/testing/app-root';
import { fakeAccountAuth } from '@/testing/app-fakes';
import { FakeAccountAuth } from '@/testing/fake-account-auth';

const auth = fakeAccountAuth();

beforeEach(() => auth.reset());

async function sendCodeTo(email: string) {
  await renderRouter(APP_ROUTES, { initialUrl: '/sign-in' });
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
}

describe('signing in with an emailed code', () => {
  it('asks again when the email address is not valid, and sends nothing', async () => {
    await sendCodeTo('not-an-email');

    expect(await screen.findByRole('alert')).toHaveTextContent(/doesn't look like an email/);
    expect(auth.codesSentTo).toEqual([]);
  });

  it('sends a code to the tidied-up address and moves on to the code step', async () => {
    await sendCodeTo('  Person@Example.COM ');

    await waitFor(() => expect(screen).toHavePathname('/verify-code'));
    expect(auth.codesSentTo).toEqual(['person@example.com']);
    expect(screen.getByText(/we sent to person@example\.com/)).toBeOnTheScreen();
  });

  it('explains calmly when the code could not be sent', async () => {
    auth.failNextCallWith(new SignInError('network'));

    await sendCodeTo('person@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(/check your internet connection/);
    expect(screen).toHavePathname('/sign-in');
  });

  it('signs in with the right code and opens the app', async () => {
    await sendCodeTo('person@example.com');

    await fireEvent.changeText(await screen.findByLabelText('Sign-in code'), FakeAccountAuth.CODE);

    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(screen.getByRole('heading', { name: 'Calm Mode' })).toBeOnTheScreen();
  });

  it('says so when the code is wrong, and stays on the code step', async () => {
    await sendCodeTo('person@example.com');

    await fireEvent.changeText(await screen.findByLabelText('Sign-in code'), '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(/code didn't work/);
    expect(screen).toHavePathname('/verify-code');
  });

  it('offers a new code only once a minute has passed', async () => {
    jest.useFakeTimers();
    try {
      await sendCodeTo('person@example.com');
      await screen.findByLabelText('Sign-in code');

      expect(screen.getByRole('button', { name: 'Send a new code in 60 seconds' })).toBeDisabled();

      for (let second = 0; second < 60; second += 1) {
        await act(() => jest.advanceTimersByTime(1000));
      }
      await fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));

      await waitFor(() => expect(auth.codesSentTo).toHaveLength(2));
    } finally {
      jest.useRealTimers();
    }
  });

  it('goes back to the email step when the code screen has no valid email', async () => {
    await renderRouter(APP_ROUTES, { initialUrl: '/verify-code?email=nope' });

    await waitFor(() => expect(screen).toHavePathname('/sign-in'));
  });
});
