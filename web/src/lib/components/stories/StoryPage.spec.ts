import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { storyDocumentFixture } from '$lib/utils/story-fixtures';
import StoryPage from './StoryPage.svelte';

describe('StoryPage', () => {
  it('renders visual layers and a separate semantic reading order', () => {
    const { container } = render(StoryPage, { scene: storyDocumentFixture.cover, aspectRatio: 'portrait-4:5' });
    expect(container.querySelectorAll('[data-story-element]')).toHaveLength(2);
    const layers = [...container.querySelectorAll('[data-story-element]')].map((element) =>
      element.parentElement?.getAttribute('style'),
    );
    expect(layers).toEqual(['z-index: 0;', 'z-index: 1;']);
    expect(container.querySelector('[data-story-reading-order]')).toHaveTextContent('A story worth remembering');
    expect(screen.getByLabelText('Story page')).toBeInTheDocument();
  });

  it('renders canonical server image and video elements through the media boundary', () => {
    const scene = structuredClone(storyDocumentFixture.pages[0]);
    scene.elements = [
      {
        id: 'image',
        type: 'image',
        assetId: 'asset-image',
        frame: { x: 0, y: 0, width: 400, height: 300 },
        rotation: 0,
        style: {},
        ariaHidden: false,
        altText: 'Beach',
      },
      {
        id: 'video',
        type: 'video',
        assetId: 'asset-video',
        frame: { x: 0, y: 300, width: 400, height: 225 },
        rotation: 0,
        style: {},
        ariaHidden: false,
        altText: 'Waves',
        videoPlayback: { mode: 'click', delayMs: 0 },
      },
    ];
    scene.readingOrder = ['image', 'video'];
    const mediaResolver = (assetId: string) =>
      assetId === 'asset-image' ? { imageUrl: '/image.jpg' } : { videoUrl: '/video.mp4', posterUrl: '/poster.jpg' };
    const { container } = render(StoryPage, { scene, aspectRatio: 'portrait-4:5', mediaResolver });
    expect(container.querySelector('img[src="/image.jpg"]')).toBeInTheDocument();
    expect(container.querySelector('video[src="/video.mp4"]')).toBeInTheDocument();
    expect(screen.getByLabelText('Beach')).toBeInTheDocument();
    const playButton = screen.getByRole('button', { name: 'Play Waves' });
    expect(playButton).toBeInTheDocument();
    expect(playButton).not.toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('button', { name: 'Play Waves' })).toHaveLength(1);
  });

  it('renders the stable built-in sticker catalog without an external URL', () => {
    const scene = structuredClone(storyDocumentFixture.pages[0]);
    scene.elements = [
      {
        id: 'heart',
        type: 'sticker',
        frame: { x: 0, y: 0, width: 200, height: 200 },
        rotation: 0,
        style: { stickerToken: 'builtin:heart' },
        ariaHidden: true,
      },
    ];
    scene.readingOrder = [];
    const { container } = render(StoryPage, { scene, aspectRatio: 'portrait-4:5' });
    expect(container).toHaveTextContent('♥');
    expect(container.querySelector('[data-story-missing]')).not.toBeInTheDocument();
  });
});
