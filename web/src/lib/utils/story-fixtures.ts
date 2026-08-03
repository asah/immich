import type { StoryDocument } from './story-model';

const scene = (id: string) => ({
  id,
  template: 'blank',
  background: '#FFFFFF',
  durationMs: 6000,
  elements: [
    {
      id: `${id}-shape`,
      type: 'shape' as const,
      frame: { x: 50, y: 50, width: 700, height: 200 },
      rotation: 0,
      style: { shape: 'rectangle', fill: '#DDE4FF', name: 'Background accent' },
      ariaHidden: true,
    },
    {
      id: `${id}-title`,
      type: 'text' as const,
      frame: { x: 100, y: 100, width: 600, height: 120 },
      rotation: 0,
      text: 'A story worth remembering',
      style: {
        font: 'inter',
        size: 42,
        lineHeight: 52,
        letterSpacing: 0,
        weight: 600,
        alignment: 'center',
        color: '#111111',
        name: 'Title',
      },
      ariaHidden: false,
    },
  ],
  readingOrder: [`${id}-title`],
});

export const storyDocumentFixture: StoryDocument = {
  schemaVersion: 1,
  theme: { id: 'classic', version: 1 },
  cover: scene('00000000-0000-4000-8000-000000000001'),
  pages: [scene('00000000-0000-4000-8000-000000000002')],
  unplacedAssetIds: [],
  curation: {},
};
