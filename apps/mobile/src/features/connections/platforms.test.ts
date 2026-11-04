import { UPCOMING_PLATFORMS, upcomingPlatformsShownIn } from './platforms';

describe('upcoming Platforms', () => {
  it('are shown in development and preview builds', () => {
    expect(upcomingPlatformsShownIn('development')).toEqual(UPCOMING_PLATFORMS);
    expect(upcomingPlatformsShownIn('preview')).toEqual(UPCOMING_PLATFORMS);
  });

  it('are never shown in store builds', () => {
    expect(upcomingPlatformsShownIn('production')).toEqual([]);
  });
});
