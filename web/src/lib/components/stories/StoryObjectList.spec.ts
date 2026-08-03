import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { storyDocumentFixture } from '$lib/utils/story-fixtures';
import StoryObjectList from './StoryObjectList.svelte';

describe('StoryObjectList', () => {
  it('selects and exposes keyboard-operable actions', async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const title = storyDocumentFixture.cover.elements[1];
    render(StoryObjectList, { scene: storyDocumentFixture.cover, selectedId: title.id, onSelect, onDelete });
    await fireEvent.click(screen.getByRole('button', { name: /Title text/ }));
    expect(onSelect).toHaveBeenCalledWith(title.id);
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(title.id);
  });
});
