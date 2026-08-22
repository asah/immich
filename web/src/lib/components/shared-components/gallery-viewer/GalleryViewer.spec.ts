import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { assetFactory } from '@test-data/factories/asset-factory';
import GalleryViewer from './GalleryViewer.svelte';

describe('GalleryViewer section links', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
  });

  test('links an album tag section to its in-album position and offers the library-wide tag view', () => {
    const asset = assetFactory.build({ id: 'section-asset' });
    render(GalleryViewer, {
      assets: [asset],
      assetInteraction: new AssetMultiSelectManager(),
      viewport: { width: 1000, height: 800 },
      album: { id: 'album-id' } as never,
      primarySortGroupKeys: ['Beach'],
      primarySortGroupDescriptions: { Beach: 'Summer photos' },
    });

    expect(screen.getAllByRole('link', { name: 'Beach' })[0]).toHaveAttribute(
      'href',
      '/albums/album-id?at=section-asset',
    );
    expect(screen.getByRole('link', { name: 'all_photos' })).toHaveAttribute('href', '/tag/Beach');
    expect(screen.getByLabelText('Beach')).toHaveAttribute('data-section-anchor', 'section-asset');
    expect(screen.getByText('items_count')).toBeInTheDocument();
  });

  test('does not leave description-sized space below a section without a description', () => {
    const asset = assetFactory.build({ id: 'section-asset' });
    const { container } = render(GalleryViewer, {
      assets: [asset],
      assetInteraction: new AssetMultiSelectManager(),
      viewport: { width: 1000, height: 800 },
      album: { id: 'album-id' } as never,
      primarySortGroupKeys: ['Beach'],
      primarySortGroupDescriptions: { Beach: null },
    });

    expect(container.querySelector('[data-section-bar="section-asset"]')).toHaveStyle({ top: '0px' });
  });

  test('uses the configured album row height for the justified layout', () => {
    const asset = assetFactory.build({ id: 'asset-id' });
    const { container } = render(GalleryViewer, {
      assets: [asset],
      assetInteraction: new AssetMultiSelectManager(),
      viewport: { width: 1000, height: 800 },
      rowHeight: 160,
    });

    expect(container.querySelector('[data-row-height]')).toHaveAttribute('data-row-height', '160');
  });
});
