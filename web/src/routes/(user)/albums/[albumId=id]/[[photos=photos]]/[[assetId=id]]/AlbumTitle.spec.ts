import { render, screen } from '@testing-library/svelte';
import { describe, expect, test, vi } from 'vitest';
import { getAssetMediaUrl } from '$lib/utils';
import AlbumTitle from './AlbumTitle.svelte';

vi.mock('$lib/utils', () => ({ getAssetMediaUrl: vi.fn() }));

describe('AlbumTitle', () => {
  test('displays the selected album cover in the header', () => {
    vi.mocked(getAssetMediaUrl).mockReturnValue('/assets/cover/thumbnail');

    render(AlbumTitle, {
      id: 'album-id',
      albumName: 'Summer trip',
      albumThumbnailAssetId: 'cover-id',
      isOwned: false,
      onUpdate: vi.fn(),
    });

    expect(screen.getByTestId('album-header-cover')).toHaveAttribute('src', '/assets/cover/thumbnail');
    expect(screen.getByTestId('album-header-cover')).toHaveAttribute('alt', 'Summer trip');
    expect(getAssetMediaUrl).toHaveBeenCalledWith({ id: 'cover-id' });
  });
});
