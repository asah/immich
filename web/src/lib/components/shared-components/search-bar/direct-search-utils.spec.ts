import type { AlbumResponseDto, AssetResponseDto } from '@immich/sdk';
import { combineDirectSearchResults } from './direct-search-utils';

describe('combineDirectSearchResults', () => {
  it('puts albums first and limits navigation results to ten', () => {
    const albums = Array.from({ length: 3 }, (_, index) => ({ id: `album-${index}` })) as AlbumResponseDto[];
    const assets = Array.from({ length: 12 }, (_, index) => ({ id: `asset-${index}` })) as AssetResponseDto[];

    const results = combineDirectSearchResults(albums, assets);

    expect(results).toHaveLength(10);
    expect(results.map((result) => (result.type === 'album' ? result.album.id : result.asset.id))).toEqual([
      'album-0',
      'album-1',
      'album-2',
      ...Array.from({ length: 7 }, (_, index) => `asset-${index}`),
    ]);
  });
});
