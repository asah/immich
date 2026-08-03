import { describe, expect, it } from 'vitest';
import {
  getStoryViewportMetrics,
  moveStoryItem,
  normalizeStoryRotation,
  quantizeStoryUnit,
  resizeStoryVideoFrame,
  storyPointToViewport,
  viewportPointToStory,
} from './story-geometry';

describe('story geometry', () => {
  it('quantizes half away from zero', () => {
    expect(quantizeStoryUnit(1.2345)).toBe(1.235);
    expect(quantizeStoryUnit(-1.2345)).toBe(-1.235);
    expect(() => quantizeStoryUnit(Number.NaN)).toThrow();
  });

  it('normalizes rotation', () => {
    expect(normalizeStoryRotation(180)).toBe(-180);
    expect(normalizeStoryRotation(540)).toBe(-180);
    expect(normalizeStoryRotation(-360)).toBe(0);
  });

  it('fits and round-trips viewport coordinates', () => {
    const metrics = getStoryViewportMetrics('portrait-4:5', 1000, 1000);
    expect(metrics).toEqual({ scale: 1, renderedWidth: 800, renderedHeight: 1000, offsetX: 100, offsetY: 0 });
    const viewport = storyPointToViewport({ x: 200, y: 250 }, metrics);
    expect(viewportPointToStory(viewport, metrics)).toEqual({ x: 200, y: 250 });
  });

  it('preserves a video aspect ratio', () => {
    expect(resizeStoryVideoFrame({ x: 0, y: 0, width: 160, height: 90 }, 1920, 1080, 'width', 320)).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 180,
    });
  });

  it('uses array order as authority', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveStoryItem(items, 'a', { afterId: 'c' }).map(({ id }) => id)).toEqual(['b', 'c', 'a']);
    expect(moveStoryItem(items, 'c', { beforeId: 'a' }).map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });
});
