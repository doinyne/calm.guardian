import { join } from 'node:path';

import { renderRouter, screen } from 'expo-router/testing-library';

// Renders the real route tree in src/app, so layout and guard mistakes show up here rather than
// on a device.
describe('navigation', () => {
  it('sends a signed-out user who opens the app to the welcome screen', async () => {
    await renderRouter(join(__dirname, 'app'), { initialUrl: '/' });

    expect(screen).toHavePathname('/welcome');
    expect(screen.getByRole('heading', { name: 'Calm Guardian' })).toBeOnTheScreen();
  });
});
