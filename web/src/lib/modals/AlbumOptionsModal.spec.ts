import { fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handleUpdateAlbum } from '$lib/services/album.service';
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
    vi.clearAllMocks();
    albumAssetViewSettings.set(defaultSettings);
  });

  test('renders as a closable right-side panel and persists image row height changes', async () => {
    const onClose = vi.fn();
    renderWithTooltips(AlbumOptionsModal, { album: albumFactory.build(), inline: true, onClose });

    expect(screen.getByTestId('album-options-panel')).toBeVisible();

    const rowHeight = screen.getByLabelText('Image row height');
    await fireEvent.change(rowHeight, { target: { value: '180' } });
    expect(handleUpdateAlbum).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ presentation: expect.objectContaining({ rowHeight: 180 }) }),
    );
    expect(screen.getByText('180px')).toBeVisible();

    await fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('persists every display-info option, including reactions', async () => {
    renderWithTooltips(AlbumOptionsModal, { album: albumFactory.build(), inline: true, onClose: vi.fn() });

    const displayOptions = [
      'location',
      'date_taken',
      'time',
      'file_name_text',
      'description',
      'file_size',
      'camera_make_model',
      'camera_settings',
      'lens_name',
      'lens_settings',
      'reactions',
    ];
    for (const label of displayOptions) {
      await fireEvent.click(screen.getByLabelText(label));
    }

    expect(handleUpdateAlbum).toHaveBeenCalledTimes(displayOptions.length);
    expect(handleUpdateAlbum).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        presentation: expect.objectContaining({
          displayInfo: expect.objectContaining({
            location: true,
            date: true,
            time: true,
            filename: true,
            description: true,
            fileSize: true,
            camera: true,
            cameraSettings: true,
            lens: true,
            lensSettings: true,
            reactions: false,
          }),
        }),
      }),
    );
  });

  test('persists sorting, gallery, voting, and activity options', async () => {
    renderWithTooltips(AlbumOptionsModal, { album: albumFactory.build(), inline: true, onClose: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: /add_sort_criterion/i }));
    expect(handleUpdateAlbum).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        presentation: expect.objectContaining({
          sortCriteria: expect.arrayContaining([expect.objectContaining({ sortBy: AlbumAssetSortBy.DateTaken })]),
        }),
      }),
    );
    await fireEvent.click(screen.getAllByRole('button', { name: 'remove' }).at(-1)!);
    expect(handleUpdateAlbum).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        presentation: expect.objectContaining({
          sortCriteria: [expect.objectContaining({ sortBy: AlbumAssetSortBy.DateTaken, sortOrder: SortOrder.Desc })],
        }),
      }),
    );

    for (const label of ['album_sort_dividers', 'Instant camera', 'Collect votes', 'comments_and_likes']) {
      await fireEvent.click(screen.getByLabelText(label));
    }

    expect(screen.getByText('Voting sample')).toBeVisible();
    expect(screen.getByText('Anonymous voters')).toBeVisible();
    expect(screen.getByText('Show community favorites')).toBeVisible();

    await fireEvent.click(screen.getByLabelText('Anonymous voters'));
    await fireEvent.click(screen.getByLabelText('Show community favorites'));
    expect(handleUpdateAlbum).toHaveBeenCalledTimes(8);
    expect(handleUpdateAlbum).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        voting: expect.objectContaining({ enabled: true, allowAnonymous: false, leaderboardVisible: false }),
      }),
    );
  });

  test('disables every editable album option for read-only viewers', () => {
    renderWithTooltips(AlbumOptionsModal, {
      album: albumFactory.build(),
      inline: true,
      readOnly: true,
      onClose: vi.fn(),
    });

    expect(screen.getByLabelText('Image row height')).toBeDisabled();
    expect(screen.getByLabelText('reactions')).toBeDisabled();
    expect(screen.getByLabelText('Instant camera')).toBeDisabled();
    expect(screen.getByLabelText('Collect votes')).toBeDisabled();
    expect(screen.getByLabelText('comments_and_likes')).toBeDisabled();
  });
});
