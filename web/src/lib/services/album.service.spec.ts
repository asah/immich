import { describe, expect, test, vi } from 'vitest';
import { openFileUploadDialog } from '$lib/utils/file-uploader';
import { albumFactory } from '@test-data/factories/album-factory';
import { getAlbumAssetsActions } from './album.service';

vi.mock('$lib/utils/file-uploader', () => ({ openFileUploadDialog: vi.fn() }));

describe('getAlbumAssetsActions', () => {
  test('uploads from the album view directly into the current album', () => {
    const album = albumFactory.build({ id: 'album-id' });
    const { Upload } = getAlbumAssetsActions(vi.fn((id) => String(id)) as never, album, []);

    Upload.onAction(Upload);

    expect(openFileUploadDialog).toHaveBeenCalledWith({ albumId: 'album-id' });
  });
});
