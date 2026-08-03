import { describe, expect, it } from 'vitest';
import { StoryAiDraftController, type StoryAiDraft } from './story-ai-state';

const draft: StoryAiDraft = {
  id: 'draft-1',
  contentHash: 'sha256:abc',
  baseRevision: 4,
  expiresAt: '2026-08-03T09:00:00Z',
  commands: [{ op: 'theme.apply', theme: 'minimal' }],
  diff: {
    summary: 'Applied a minimal theme',
    affectedPageIds: ['page-1'],
    changes: [{ kind: 'change', label: 'Theme' }],
  },
};

describe('StoryAiDraftController', () => {
  it('binds apply to the immutable preview draft ID', () => {
    const controller = new StoryAiDraftController();
    controller.start('Apply a theme');
    controller.preview(draft);
    expect(Object.isFrozen(controller.state.state === 'preview' && controller.state.draft.commands)).toBe(true);
    expect(controller.beginApply(4)).toBe('draft-1');
    expect(controller.state.state).toBe('applying');
  });

  it('rejects a preview when the revision changed', () => {
    const controller = new StoryAiDraftController();
    controller.start('Apply a theme');
    controller.preview(draft);
    expect(controller.beginApply(5)).toBeUndefined();
    expect(controller.state).toMatchObject({ state: 'stale', reason: 'The story changed after this preview.' });
  });
});
