import type { AssetResponseDto } from '@immich/sdk';
import { getGroupedJustifiedLayoutFromAssets } from '$lib/utils/layout-utils';

describe('getGroupedJustifiedLayoutFromAssets', () => {
  it('starts each sort group below a full-width divider', () => {
    const assets = [
      { width: 100, height: 100 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ] as AssetResponseDto[];
    const options = { rowHeight: 100, rowWidth: 300, spacing: 2, heightTolerance: 0.5 };

    const grouped = getGroupedJustifiedLayoutFromAssets(assets, ['a', 'a', 'b'], options, 32);
    const ungroupedFirst = getGroupedJustifiedLayoutFromAssets(assets.slice(0, 2), ['a', 'a'], options, 32);

    expect(grouped.dividerTops).toEqual([ungroupedFirst.containerHeight + 16]);
    expect(grouped.getTop(2)).toBe(ungroupedFirst.containerHeight + 32);
    expect(grouped.containerHeight).toBeGreaterThan(grouped.getTop(2));
  });
});
