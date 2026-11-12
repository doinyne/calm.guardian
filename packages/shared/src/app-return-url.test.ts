import { describe, expect, it } from 'vitest';

import { isAppReturnUrl } from './app-return-url';

describe('app return links', () => {
  it("accept Expo Go's links and the app's own", () => {
    expect(isAppReturnUrl('exp://192.168.1.4:8081/--/connect/bluesky')).toBe(true);
    expect(isAppReturnUrl('exps://u.expo.dev/abc/--/connect/bluesky')).toBe(true);
    expect(isAppReturnUrl('calmguardian-dev://connect/bluesky')).toBe(true);
  });

  it('refuse web addresses and anything else', () => {
    expect(isAppReturnUrl('https://evil.example/steal')).toBe(false);
    expect(isAppReturnUrl('javascript:alert(1)')).toBe(false);
    expect(isAppReturnUrl('not a url')).toBe(false);
  });
});
