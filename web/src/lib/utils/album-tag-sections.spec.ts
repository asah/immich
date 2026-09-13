import { describe, expect, it } from 'vitest';
import type { AssetResponseDto } from '@immich/sdk';
import { SortOrder } from '$lib/stores/preferences.store';
import { compareAlbumTagSections, getAlbumTagSection } from './album-tag-sections';

const asset = (id: string, tag?: string): AssetResponseDto =>
  ({ id, tags: tag ? [{ id: `${id}-tag`, name: tag, color: null, description: null, createdAt: '', updatedAt: '' }] : [] }) as unknown as AssetResponseDto;

describe('album tag sections', () => {
  it('sorts named tag sections ascending and keeps untagged last', () => {
    const assets = [asset('none'), asset('z', 'Zebra'), asset('a', 'Apple')];
    expect(assets.sort((left, right) => compareAlbumTagSections(left, right, SortOrder.Asc)).map(getAlbumTagSection)).toEqual([
      'Apple',
      'Zebra',
      'Untagged',
    ]);
  });

  it('sorts named tag sections descending while keeping untagged last', () => {
    const assets = [asset('none'), asset('a', 'Apple'), asset('z', 'Zebra')];
    expect(assets.sort((left, right) => compareAlbumTagSections(left, right, SortOrder.Desc)).map(getAlbumTagSection)).toEqual([
      'Zebra',
      'Apple',
      'Untagged',
    ]);
  });

  it('does not treat a real tag named Untagged as the synthetic section', () => {
    const tagged = asset('tagged', 'Untagged');
    const untagged = asset('none');
    expect(compareAlbumTagSections(tagged, untagged, SortOrder.Asc)).toBeLessThan(0);
  });
});
