import { HELPLINE_DIRECTORY_URL } from '@calm-guardian/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';

import { WelcomeScreen } from './welcome-screen';

describe('WelcomeScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('tells the user they are in control, and names the app', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByRole('heading', { name: "You're in control." })).toBeOnTheScreen();
    expect(screen.getByText('Calm Guardian')).toBeOnTheScreen();
  });

  it('reassures the user that their posts stay safe', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText(/your posts stay safe/i)).toBeOnTheScreen();
  });

  it('offers a helpline before anything else is asked of the user', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<WelcomeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: /find a helpline/i }));

    expect(openURL).toHaveBeenCalledWith(HELPLINE_DIRECTORY_URL);
  });

  it('shows diagnostics only when given them', async () => {
    await render(<WelcomeScreen diagnostics={<Text>API: Connected</Text>} />);

    expect(screen.getByText('API: Connected')).toBeOnTheScreen();
  });
});
