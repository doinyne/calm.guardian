import { fireEvent, render, screen } from '@testing-library/react-native';

import { CalmErrorScreen } from './calm-error-screen';

describe('the calm error screen', () => {
  it('reassures, without showing the error, and lets the user try again', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<CalmErrorScreen retry={retry} />);

    expect(screen.getByText(/Your posts are safe/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalled();
  });
});
