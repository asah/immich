import { describe, expect, it, vi } from 'vitest';
import { openSlideshowAtAsset } from './slideshow.service';

describe('openSlideshowAtAsset', () => {
  it('routes to the asset before starting playback', async () => {
    const events: string[] = [];
    const launcher = {
      navigateToAsset: vi.fn(async (id: string) => {
        events.push(`navigate:${id}`);
      }),
      start: vi.fn(() => {
        events.push('start');
      }),
    };

    await openSlideshowAtAsset('asset-id', launcher);

    expect(events).toEqual(['navigate:asset-id', 'start']);
    expect(launcher.navigateToAsset).toHaveBeenCalledWith('asset-id');
  });

  it('does not start playback when routing fails', async () => {
    const launcher = {
      navigateToAsset: vi.fn().mockRejectedValue(new Error('Asset unavailable')),
      start: vi.fn(),
    };

    await expect(openSlideshowAtAsset('asset-id', launcher)).rejects.toThrow('Asset unavailable');
    expect(launcher.navigateToAsset).toHaveBeenCalledWith('asset-id');
    expect(launcher.start).not.toHaveBeenCalled();
  });
});
