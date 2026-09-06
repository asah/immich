import type { TagResponseDto } from '@immich/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { getVisualViewportMock } from '$lib/__mocks__/visual-viewport.mock';
import { assetFactory } from '@test-data/factories/asset-factory';
import AssetTagModal from './AssetTagModal.svelte';

describe('AssetTagModal', () => {
  const assetIds = ['asset-1', 'asset-2'];
  const onClose = vi.fn();
  const tags = [
    { id: 'every-tag', value: 'Every tag' },
    { id: 'partial-tag', value: 'Partial tag' },
    { id: 'other-tag', value: 'Other tag' },
  ] as TagResponseDto[];

  const renderModal = () => render(AssetTagModal, { assetIds, onClose });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
    vi.stubGlobal('visualViewport', getVisualViewportMock());
    Element.prototype.animate = getAnimateMock();
    sdkMock.getAllTags.mockResolvedValue(tags);
    sdkMock.getAssetInfo.mockImplementation(async ({ id }) =>
      assetFactory.build({
        id,
        tags: id === 'asset-1' ? [tags[0], tags[1]] : [tags[0], tags[2]],
      }),
    );
  });

  test('loads the complete tag union from the selected asset details', async () => {
    renderModal();

    expect(await screen.findByRole('combobox')).toHaveFocus();

    const everyTag = await screen.findByLabelText('Every tag');
    const partialTag = screen.getByLabelText('Partial tag');
    const otherTag = screen.getByLabelText('Other tag');

    expect(sdkMock.getAssetInfo).toHaveBeenCalledTimes(2);
    expect(everyTag).toHaveAttribute('data-state', 'checked');
    expect(partialTag).toHaveAttribute('data-state', 'indeterminate');
    expect(otherTag).toHaveAttribute('data-state', 'indeterminate');
  });

  test('applies a partial tag to every selected asset', async () => {
    renderModal();

    await fireEvent.click(await screen.findByLabelText('Partial tag'));
    await fireEvent.click(screen.getByRole('button', { name: 'tag_assets' }));

    expect(sdkMock.bulkTagAssets).toHaveBeenCalledWith({ tagBulkAssetsDto: { tagIds: ['partial-tag'], assetIds } });
    expect(sdkMock.untagAssets).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(true);
  });

  test('removes an all-selected tag from every selected asset', async () => {
    renderModal();

    await fireEvent.click(await screen.findByLabelText('Every tag'));
    await fireEvent.click(screen.getByRole('button', { name: 'tag_assets' }));

    expect(sdkMock.untagAssets).toHaveBeenCalledWith({ id: 'every-tag', bulkIdsDto: { ids: assetIds } });
    expect(sdkMock.bulkTagAssets).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(true);
  });

  test('submits selected tag changes with Enter without selecting an autocomplete option', async () => {
    renderModal();

    await fireEvent.click(await screen.findByLabelText('Partial tag'));
    await fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    await waitFor(() =>
      expect(sdkMock.bulkTagAssets).toHaveBeenCalledWith({ tagBulkAssetsDto: { tagIds: ['partial-tag'], assetIds } }),
    );
    expect(onClose).toHaveBeenCalledWith(true);
  });

  test('selects the highlighted autocomplete option with Enter before submitting', async () => {
    renderModal();

    const combobox = await screen.findByRole('combobox');
    await fireEvent.input(combobox, { target: { value: 'Partial tag' } });
    await fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    await fireEvent.keyDown(combobox, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Partial tag')).toBeInTheDocument());
    expect(sdkMock.bulkTagAssets).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('cancels with Escape while the tag autocomplete has focus', async () => {
    renderModal();

    await fireEvent.keyDown(await screen.findByRole('combobox'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledWith();
    expect(sdkMock.bulkTagAssets).not.toHaveBeenCalled();
    expect(sdkMock.untagAssets).not.toHaveBeenCalled();
  });
});
