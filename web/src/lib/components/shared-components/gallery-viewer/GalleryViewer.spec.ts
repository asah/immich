import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getIntersectionObserverMock } from '$lib/__mocks__/intersection-observer.mock';
import { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { assetFactory } from '@test-data/factories/asset-factory';
import GalleryViewer from './GalleryViewer.svelte';

describe('GalleryViewer section links', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', getIntersectionObserverMock());
    localStorage.clear();
  });

  test('uses the section title to fold and the link icon for its in-album deep link', () => {
    const asset = assetFactory.build({ id: 'section-asset' });
    render(GalleryViewer, {
      assets: [asset],
      assetInteraction: new AssetMultiSelectManager(),
      viewport: { width: 1000, height: 800 },
      album: { id: 'album-id' } as never,
      primarySortGroupKeys: ['Beach'],
      primarySortGroupDescriptions: { Beach: 'Summer photos' },
    });

    expect(screen.getByRole('button', { name: 'Beach' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open link to section Beach' })).toHaveAttribute(
      'href',
      '/albums/album-id?at=section-asset',
    );
    expect(screen.getByRole('link', { name: 'all_photos' })).toHaveAttribute('href', '/tag/Beach');
    expect(screen.queryByText('album')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Open link to section Beach')).toHaveAttribute('data-section-anchor', 'section-asset');
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

  test('collapses a section and persists its folded state for the album', async () => {
    const asset = assetFactory.build({ id: 'section-asset' });
    const { container } = render(GalleryViewer, {
      assets: [asset],
      assetInteraction: new AssetMultiSelectManager(),
      viewport: { width: 1000, height: 800 },
      album: { id: 'album-id' } as never,
      primarySortGroupKeys: ['Beach'],
      primarySortGroupDescriptions: { Beach: null },
    });

    const toggle = screen.getByRole('button', { name: 'Collapse section Beach' });
    await toggle.click();

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-section-bar="section-asset"]')).toHaveAttribute('data-collapsed', 'true');
    expect(localStorage.getItem('album-collapsed-sections')).toContain('anonymous:album-id');
    expect(localStorage.getItem('album-collapsed-sections')).toContain('Beach');
  });

  test('temporarily opens saved-collapsed sections without changing the saved preference', async () => {
    const asset = assetFactory.build({ id: 'section-asset' });
    localStorage.setItem('album-collapsed-sections', JSON.stringify({ 'anonymous:album-id': ['Beach'] }));
    const { container } = render(GalleryViewer, {
      assets: [asset],
      assetInteraction: new AssetMultiSelectManager(),
      viewport: { width: 1000, height: 800 },
      album: { id: 'album-id' } as never,
      primarySortGroupKeys: ['Beach'],
      primarySortGroupDescriptions: { Beach: null },
      forceSectionsOpen: true,
    });

    expect(container.querySelector('[data-section-bar="section-asset"]')).toHaveAttribute('data-collapsed', 'false');
    expect(localStorage.getItem('album-collapsed-sections')).toContain('Beach');
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
