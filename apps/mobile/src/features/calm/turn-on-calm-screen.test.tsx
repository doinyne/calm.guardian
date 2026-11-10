import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { aCalmAccount, renderWithQueries, stubApi } from './testing';
import type * as ReactNative from 'react-native';

import { TurnOnCalmScreen } from './turn-on-calm-screen';

// The native picker, as a plain element whose `onChange` a test can call.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual<typeof ReactNative>('react-native');
  return {
    __esModule: true,
    default: (props: { accessibilityLabel: string }) => (
      <View testID={`picker ${props.accessibilityLabel}`} {...props} />
    ),
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

const ME = aCalmAccount();
const PREVIEW = `POST /connections/${ME.id}/calm/preview`;
const TURN_ON = `POST /connections/${ME.id}/calm`;

async function renderScreen(routes: Record<string, { status?: number; body?: unknown }>) {
  const requests = stubApi({ accounts: () => [ME], routes });
  const onDone = jest.fn();
  await renderWithQueries(
    <TurnOnCalmScreen target={{ connectedAccountId: ME.id }} onDone={onDone} />,
  );
  return { requests, onDone };
}

afterEach(() => jest.restoreAllMocks());

describe('turning on Calm Mode', () => {
  it('says roughly how many posts the chosen period will hide, starting with the last 7 days', async () => {
    const { requests } = await renderScreen({ [PREVIEW]: { body: { posts: 240, more: false } } });

    expect(await screen.findByText('240 posts will be backed up and hidden.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'The last 7 days' })).toBeChecked();
    expect(requests).toContainEqual({
      method: 'POST',
      path: `/connections/${ME.id}/calm/preview`,
      body: { period: 'last-7-days' },
    });
  });

  it('counts again when the user picks a different period', async () => {
    const { requests } = await renderScreen({ [PREVIEW]: { body: { posts: 1000, more: true } } });

    await fireEvent.press(await screen.findByRole('radio', { name: 'Everything' }));

    expect(
      await screen.findByText('More than 1,000 posts will be backed up and hidden.'),
    ).toBeOnTheScreen();
    expect(screen.getByText(/This may take a few hours/)).toBeOnTheScreen();
    expect(requests).toContainEqual({
      method: 'POST',
      path: `/connections/${ME.id}/calm/preview`,
      body: { period: 'everything' },
    });
  });

  it('turns Calm Mode on for the chosen period, then closes so home shows the progress', async () => {
    const { requests, onDone } = await renderScreen({
      [PREVIEW]: { body: { posts: 3, more: false } },
      [TURN_ON]: { status: 202, body: { calm: { calmSessionId: 'x', state: 'activating' } } },
    });

    await fireEvent.press(await screen.findByRole('radio', { name: 'The last 24 hours' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on Calm Mode' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(requests).toContainEqual({
      method: 'POST',
      path: `/connections/${ME.id}/calm`,
      body: { period: 'last-24-hours' },
    });
  });

  it('stays open and explains when the account needs signing in again', async () => {
    const { onDone } = await renderScreen({
      [PREVIEW]: { body: { posts: 3, more: false } },
      [TURN_ON]: {
        status: 409,
        body: { error: { code: 'connection_needs_sign_in', message: '' } },
      },
    });

    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on Calm Mode' }));

    expect(await screen.findByText(/Please sign in to this account again/)).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('says so calmly when there is nothing in the period', async () => {
    await renderScreen({ [PREVIEW]: { body: { posts: 0, more: false } } });

    expect(
      await screen.findByText('There are no posts from this period to hide.'),
    ).toBeOnTheScreen();
  });

  describe('choosing dates', () => {
    it('counts and turns on for the dates picked', async () => {
      const { requests, onDone } = await renderScreen({
        [PREVIEW]: { body: { posts: 4, more: false } },
        [TURN_ON]: { status: 202, body: { calm: { calmSessionId: 'x', state: 'activating' } } },
      });
      const from = new Date('2026-11-01T21:00:00.000Z');
      const to = new Date('2026-11-02T03:00:00.000Z');

      await fireEvent.press(await screen.findByRole('radio', { name: 'Choose dates' }));
      await fireEvent(screen.getByTestId('picker From'), 'onChange', { type: 'set' }, from);
      await fireEvent(screen.getByTestId('picker To'), 'onChange', { type: 'set' }, to);
      await fireEvent.press(screen.getByRole('button', { name: 'Turn on Calm Mode' }));

      await waitFor(() => expect(onDone).toHaveBeenCalled());
      const picked = { from: from.toISOString(), to: to.toISOString() };
      expect(requests).toContainEqual({
        method: 'POST',
        path: `/connections/${ME.id}/calm/preview`,
        body: { period: picked },
      });
      expect(requests).toContainEqual({
        method: 'POST',
        path: `/connections/${ME.id}/calm`,
        body: { period: picked },
      });
    });

    it("explains, and won't turn on, when the start is after the end", async () => {
      await renderScreen({ [PREVIEW]: { body: { posts: 4, more: false } } });

      await fireEvent.press(await screen.findByRole('radio', { name: 'Choose dates' }));
      await fireEvent(
        screen.getByTestId('picker From'),
        'onChange',
        { type: 'set' },
        new Date('2099-01-01T00:00:00.000Z'),
      );

      expect(screen.getByText('The start needs to be before the end.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Turn on Calm Mode' })).toBeDisabled();
    });
  });
});
