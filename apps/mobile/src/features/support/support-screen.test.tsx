import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { deviceRegion, SupportScreen } from './support-screen';

afterEach(() => jest.restoreAllMocks());

describe('support right now', () => {
  it('shows the local emergency number first, then free lines to call or text', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<SupportScreen region="GB" onClose={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Call 999' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Call Samaritans' }));

    expect(openUrl.mock.calls.map(([url]) => url)).toEqual(['tel:999', 'tel:116123']);
    expect(screen.getByRole('button', { name: 'Text Shout' })).toBeOnTheScreen();
  });

  it('points to the worldwide directory anywhere we have no local lines for', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<SupportScreen region="ZZ" onClose={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Find a helpline' }));

    expect(screen.getByRole('button', { name: 'Call 112' })).toBeOnTheScreen();
    expect(openUrl).toHaveBeenCalledWith('https://findahelpline.com');
  });

  it("says it isn't a medical device", async () => {
    await render(<SupportScreen region="GB" onClose={jest.fn()} />);

    expect(screen.getByText(/isn't a medical device/)).toBeOnTheScreen();
  });
});

describe("the phone's region", () => {
  it('comes from its locale', () => {
    expect(deviceRegion('en-GB')).toBe('GB');
    expect(deviceRegion('fr_CA')).toBe('CA');
    expect(deviceRegion('zh-Hant-TW')).toBe('TW');
    expect(deviceRegion('en')).toBeUndefined();
  });
});
