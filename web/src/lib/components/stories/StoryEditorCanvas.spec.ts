import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import {
  MemoryStoryRecoveryStore,
  StoryEditorTransactionManager,
  type StoryCommandBatch,
} from '$lib/utils/story-editor-state';
import { storyDocumentFixture } from '$lib/utils/story-fixtures';
import StoryEditorCanvas from './StoryEditorCanvas.svelte';

const setup = () => {
  const scene = structuredClone(storyDocumentFixture.cover);
  const transactionManager = new StoryEditorTransactionManager({
    storyId: 'story',
    sessionId: 'session',
    revision: 1,
    document: storyDocumentFixture,
    recovery: new MemoryStoryRecoveryStore(),
  });
  const onBatch = vi.fn(async (_batch: StoryCommandBatch) => {});
  render(StoryEditorCanvas, { scene, aspectRatio: 'portrait-4:5', transactionManager, onBatch });
  return { onBatch };
};

describe('StoryEditorCanvas', () => {
  it('exposes responsive authoring, history, sticker, and scene timing controls', async () => {
    const { onBatch } = setup();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Page duration (seconds)')).toBeInTheDocument();

    await fireEvent.change(screen.getByLabelText('Built-in sticker'), { target: { value: 'builtin:star' } });
    await waitFor(() => expect(onBatch).toHaveBeenCalledOnce());
    expect(onBatch.mock.calls[0][0].commands[0]).toMatchObject({
      op: 'element.add',
      element: { type: 'sticker', style: { stickerToken: 'builtin:star' } },
    });
  });

  it('offers safe text and accessibility controls for a selected text element', async () => {
    setup();
    await fireEvent.click(screen.getByRole('button', { name: /Title text/ }));
    expect(screen.getByLabelText('Font')).toBeInTheDocument();
    expect(screen.getByLabelText('Size')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight')).toBeInTheDocument();
    expect(screen.getByLabelText('Alignment')).toBeInTheDocument();
    expect(screen.getByLabelText(/Decorative/)).toBeInTheDocument();
    expect(screen.getByLabelText('Alt text or accessible label')).toBeInTheDocument();
  });
});
