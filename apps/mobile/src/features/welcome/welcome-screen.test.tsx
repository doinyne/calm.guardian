import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { WelcomeScreen } from './welcome-screen';

describe('WelcomeScreen', () => {
  it('names the app as the screen heading', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByRole('heading', { name: 'Calm Guardian' })).toBeOnTheScreen();
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
