import { fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AlbumAssetSortBy,
  albumAssetViewSettings,
  defaultAlbumAssetDisplayInfo,
  SortOrder,
} from '$lib/stores/preferences.store';
import { renderWithTooltips } from '$tests/helpers';
import { albumFactory } from '@test-data/factories/album-factory';
import AlbumOptionsModal from './AlbumOptionsModal.svelte';

vi.mock('$lib/services/album.service', () => ({
  getAlbumActions: vi.fn(() => ({ AddUsers: {}, CreateSharedLink: {} })),
  handleRemoveUserFromAlbum: vi.fn(),
  handleUpdateAlbum: vi.fn(),
  handleUpdateUserAlbumRole: vi.fn(),
}));

vi.mock('@immich/sdk', async () => {
  const sdk = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return { ...sdk, getAlbumInfo: vi.fn(), getAllSharedLinks: vi.fn().mockResolvedValue([]) };
});

const defaultSettings = {
  sortBy: AlbumAssetSortBy.DateTaken,
  sortOrder: SortOrder.Desc,
  sortCriteria: [{ sortBy: AlbumAssetSortBy.DateTaken, sortOrder: SortOrder.Desc }],
  showSortDividers: true,
  displayInfo: defaultAlbumAssetDisplayInfo,
};

describe('AlbumOptionsModal inline panel', () => {
  beforeEach(() => {
    albumAssetViewSettings.set(defaultSettings);
  });

  test('renders as a closable right-side panel and persists image row height changes', async () => {
    const onClose = vi.fn();
    renderWithTooltips(AlbumOptionsModal, { album: albumFactory.build(), inline: true, onClose });

    expect(screen.getByTestId('album-options-panel')).toBeVisible();

    const rowHeight = screen.getByLabelText('Image row height');
    await fireEvent.input(rowHeight, { target: { value: '180' } });
    expect(get(albumAssetViewSettings).rowHeight).toBe(180);
    expect(screen.getByText('180px')).toBeVisible();

    await fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
