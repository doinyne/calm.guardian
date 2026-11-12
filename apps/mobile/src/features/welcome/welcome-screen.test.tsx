import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

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

  it('shows diagnostics only when given them', async () => {
    await render(<WelcomeScreen diagnostics={<Text>API: Connected</Text>} />);

    expect(screen.getByText('API: Connected')).toBeOnTheScreen();
  });
});
