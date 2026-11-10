import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { aCalmAccount, renderWithQueries, stubApi } from '@/features/calm/testing';

import { GuardiansScreen } from './guardians-screen';

const ACCOUNT = aCalmAccount();
const ALEX = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  email: 'alex@example.com',
  state: 'active',
};

async function renderGuardians(
  guardians: () => (typeof ALEX)[],
  routes: Parameters<typeof stubApi>[0]['routes'] = {},
) {
  const requests = stubApi({
    accounts: () => [ACCOUNT],
    routes: { 'GET /guardians': () => ({ body: { guardians: guardians(), max: 3 } }), ...routes },
  });
  await renderWithQueries(<GuardiansScreen />);
  return requests;
}

afterEach(() => jest.restoreAllMocks());

describe('your Guardians', () => {
  it('lists them, and how many more you can have', async () => {
    await renderGuardians(() => [ALEX]);

    expect(await screen.findByText('alex@example.com')).toBeOnTheScreen();
    expect(screen.getByText('Your Guardians · 1 of 3')).toBeOnTheScreen();
  });

  it('invites someone by email', async () => {
    let list: (typeof ALEX)[] = [];
    const requests = await renderGuardians(() => list, {
      'POST /guardians': { status: 201, body: { guardian: { ...ALEX, state: 'invited' } } },
    });

    await fireEvent.changeText(
      await screen.findByLabelText('Invite a Guardian by email'),
      'Alex@Example.com',
    );
    list = [{ ...ALEX, state: 'invited' }];
    await fireEvent.press(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByText(/Invitation sent/)).toBeOnTheScreen();
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/guardians',
      body: { email: 'alex@example.com' },
    });
    expect(await screen.findByText('Invited')).toBeOnTheScreen();
  });

  it('explains when you already have as many as you can', async () => {
    await renderGuardians(() => [], {
      'POST /guardians': {
        status: 409,
        body: { error: { code: 'guardian_limit_reached', message: '' } },
      },
    });

    await fireEvent.changeText(
      await screen.findByLabelText('Invite a Guardian by email'),
      'sam@example.com',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByText(/Remove one to invite someone new/)).toBeOnTheScreen();
  });

  it('removes a Guardian after a calm confirmation', async () => {
    const requests = await renderGuardians(() => [ALEX], {
      [`DELETE /guardians/${ALEX.id}`]: { status: 204 },
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Remove')?.onPress?.();
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Remove alex@example.com' }));

    await waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: `/guardians/${ALEX.id}` }),
    );
  });

  it('lets you choose, per account, whether Guardians can turn Calm Mode on', async () => {
    const requests = await renderGuardians(() => [ALEX], {
      [`PUT /connections/${ACCOUNT.id}/guardians-can-turn-on`]: { status: 204 },
    });

    const toggle = await screen.findByLabelText(
      'Guardians can turn on Calm Mode for @doinyne.bsky.social',
    );
    expect(toggle.props.value).toBe(false);
    await fireEvent(toggle, 'valueChange', true);

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PUT',
        path: `/connections/${ACCOUNT.id}/guardians-can-turn-on`,
        body: { allowed: true },
      }),
    );
  });
});
