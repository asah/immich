import { describe, expect, it } from 'vitest';
import { createBlankStoryPageCommand, createStoryPageMoveCommand } from './story-page-actions';

const pages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('story page actions', () => {
  it('creates a bounded blank page after the selected page', () => {
    expect(createBlankStoryPageCommand('new', 'b')).toEqual({
      op: 'page.insert',
      afterPageId: 'b',
      page: {
        id: 'new',
        template: 'blank',
        background: '#FFFFFF',
        durationMs: 6000,
        elements: [],
        readingOrder: [],
      },
    });
  });

  it('moves a page before its previous neighbor using relative ordering', () => {
    expect(createStoryPageMoveCommand(pages, 2, -1)).toMatchObject({ pageId: 'c', afterPageId: 'a' });
    expect(createStoryPageMoveCommand(pages, 1, -1)).toMatchObject({ pageId: 'b', afterPageId: null });
  });

  it('moves a page after its next neighbor and rejects boundary moves', () => {
    expect(createStoryPageMoveCommand(pages, 0, 1)).toMatchObject({ pageId: 'a', afterPageId: 'b' });
    expect(() => createStoryPageMoveCommand(pages, 2, 1)).toThrow(RangeError);
  });
});
