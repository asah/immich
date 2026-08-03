import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { StoryAiDraft } from '$lib/utils/story-ai-state';
import StoryAiAssistant from './StoryAiAssistant.svelte';

const provider = { state: 'ready', providerName: 'Example AI', modelName: 'Vision', billing: 'server' } as const;
const draft: StoryAiDraft = {
  id: 'draft-1',
  contentHash: 'sha256:abc',
  baseRevision: 4,
  expiresAt: '2026-08-03T09:00:00Z',
  commands: [{ op: 'story.shorten' }],
  diff: {
    summary: 'Shortened the story',
    affectedPageIds: ['page-1'],
    changes: [{ kind: 'remove', label: 'Two pages' }],
  },
};

describe('StoryAiAssistant', () => {
  it('requires text consent and keeps thumbnail consent separate', async () => {
    const onSaveConsent = vi.fn();
    render(StoryAiAssistant, {
      provider,
      providerFingerprint: 'provider-1',
      aiState: { state: 'idle' },
      actions: [],
      onSaveConsent,
    });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    await fireEvent.click(screen.getByLabelText('Allow story text and layout details to be sent'));
    await fireEvent.click(continueButton);
    expect(onSaveConsent).toHaveBeenCalledWith({ textAllowed: true, thumbnailsAllowed: false });
  });

  it('shows an immutable draft diff and applies by draft ID only', async () => {
    const onApply = vi.fn();
    render(StoryAiAssistant, {
      provider,
      providerFingerprint: 'provider-1',
      consent: { providerFingerprint: 'provider-1', textAllowed: true, thumbnailsAllowed: false, decidedAt: 'now' },
      aiState: { state: 'preview', draft },
      actions: [],
      onApply,
    });
    expect(screen.getByText('Shortened the story')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Apply preview' }));
    expect(onApply).toHaveBeenCalledWith('draft-1');
  });
});
