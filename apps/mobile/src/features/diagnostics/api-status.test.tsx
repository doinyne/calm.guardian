import { render, screen } from '@testing-library/react-native';

import { ApiStatusView } from './api-status';

const API_URL = 'https://api.example.com';

describe('ApiStatusView', () => {
  it.each([
    ['checking', 'API: Checking…'],
    ['connected', 'API: Connected'],
    ['unreachable', 'API: Unreachable'],
  ] as const)('describes the %s state', async (state, expectedText) => {
    await render(<ApiStatusView state={state} apiUrl={API_URL} />);

    expect(screen.getByText(expectedText)).toBeOnTheScreen();
  });

  it('tells screen reader users which API the build uses', async () => {
    await render(<ApiStatusView state="connected" apiUrl={API_URL} />);

    expect(screen.getByLabelText(`API Connected. ${API_URL}`)).toBeOnTheScreen();
  });
});
