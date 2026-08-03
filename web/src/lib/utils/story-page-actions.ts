import type { StoryCommand } from './story-editor-state';

export const createBlankStoryPageCommand = (pageId: string, afterPageId: string | null): StoryCommand => ({
  op: 'page.insert',
  afterPageId,
  page: {
    id: pageId,
    template: 'blank',
    background: '#FFFFFF',
    durationMs: 6000,
    elements: [],
    readingOrder: [],
  },
});

export const createStoryPageMoveCommand = (
  pages: Array<{ id: string }>,
  index: number,
  direction: -1 | 1,
): StoryCommand => {
  if (index + direction < 0 || index + direction >= pages.length) throw new RangeError('Page move is out of bounds');
  return {
    op: 'page.move',
    pageId: pages[index].id,
    afterPageId: direction < 0 ? (pages[index - 2]?.id ?? null) : pages[index + 1].id,
  };
};
