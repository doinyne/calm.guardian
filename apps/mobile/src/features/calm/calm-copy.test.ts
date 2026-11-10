import { durationSentence } from './calm-copy';

describe('how long hiding will take', () => {
  it('says nothing for a quick job', () => {
    expect(durationSentence({ posts: 300, more: false })).toBeNull();
  });

  it('gives a rough time for a long one, based on Bluesky allowing about 5,000 an hour', () => {
    expect(durationSentence({ posts: 9_000, more: false })).toBe(
      'This will take about 2 hours. Your newest posts are hidden first, and it carries on if you close the app.',
    );
    expect(durationSentence({ posts: 4_000, more: false })).toBe(
      'This will take about an hour. Your newest posts are hidden first, and it carries on if you close the app.',
    );
  });

  it('is honest when there are too many to count', () => {
    expect(durationSentence({ posts: 1_000, more: true })).toBe(
      'This may take a few hours. Your newest posts are hidden first, and it carries on if you close the app.',
    );
  });
});
