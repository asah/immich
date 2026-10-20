import type { AlbumResponseDto, AssetResponseDto } from '@immich/sdk';

export type DirectSearchResult =
  { type: 'album'; album: AlbumResponseDto } | { type: 'asset'; asset: AssetResponseDto };

export const combineDirectSearchResults = (
  albums: AlbumResponseDto[],
  assets: AssetResponseDto[],
): DirectSearchResult[] =>
  [
    ...albums.map((album) => ({ type: 'album' as const, album })),
    ...assets.map((asset) => ({ type: 'asset' as const, asset })),
  ].slice(0, 10);
