import { describe, expect, it } from 'vitest';
import { clampStoryTime, getStoryAnimationState, isStoryVideoTriggered } from './story-clock';
import { storyDocumentFixture } from './story-fixtures';

describe('story clock', () => {
  it('clamps time to scene duration', () => {
    expect(clampStoryTime(storyDocumentFixture.cover, -10)).toBe(0);
    expect(clampStoryTime(storyDocumentFixture.cover, 7000)).toBe(6000);
  });

  it('triggers constrained video modes', () => {
    expect(isStoryVideoTriggered('click', undefined, 5000)).toBe(false);
    expect(isStoryVideoTriggered('autoplay', undefined, 0)).toBe(true);
    expect(isStoryVideoTriggered('delay', 1000, 999)).toBe(false);
    expect(isStoryVideoTriggered('delay', 1000, 1000)).toBe(true);
  });

  it('derives animation state from time', () => {
    const animation = {
      preset: 'fade',
      startMs: 100,
      durationMs: 400,
      easing: 'linear',
      reducedMotion: 'omit',
    } as const;
    expect(getStoryAnimationState(animation, 100, 'full').opacity).toBe(0);
    expect(getStoryAnimationState(animation, 300, 'full').opacity).toBe(0.5);
    expect(getStoryAnimationState(animation, 500, 'full').opacity).toBe(1);
    expect(getStoryAnimationState(animation, 0, 'reduced')).toEqual({ opacity: 1, transform: 'none' });
  });
});
