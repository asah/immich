import type { StoryCommand } from './story-editor-state';

export type StoryAiProviderStatus =
  | { state: 'unavailable'; reason: string }
  | { state: 'setup-required' }
  | { state: 'ready'; providerName: string; modelName: string; billing: 'server' | 'user' };

export type StoryAiConsent = {
  providerFingerprint: string;
  textAllowed: boolean;
  thumbnailsAllowed: boolean;
  decidedAt: string;
};

export type StoryAiAction = {
  id: string;
  label: string;
  description: string;
  requiresThumbnails?: boolean;
};

export type StoryAiDiff = {
  summary: string;
  affectedPageIds: string[];
  changes: Array<{ kind: 'add' | 'change' | 'remove'; label: string }>;
};

export type StoryAiDraft = Readonly<{
  id: string;
  contentHash: string;
  baseRevision: number;
  expiresAt: string;
  commands: readonly Readonly<StoryCommand>[];
  diff: Readonly<StoryAiDiff>;
}>;

export type StoryAiState =
  | { state: 'idle' }
  | { state: 'working'; actionLabel: string }
  | { state: 'preview'; draft: StoryAiDraft }
  | { state: 'applying'; draft: StoryAiDraft }
  | { state: 'stale'; draft: StoryAiDraft; reason: string }
  | { state: 'error'; message: string };

export class StoryAiDraftController {
  #state: StoryAiState = { state: 'idle' };

  get state(): StoryAiState {
    return this.#state;
  }

  start(actionLabel: string) {
    if (this.#state.state === 'applying') {
      throw new Error('Cannot start while applying an AI draft');
    }
    this.#state = { state: 'working', actionLabel };
  }

  preview(draft: StoryAiDraft) {
    if (this.#state.state !== 'working') {
      throw new Error('AI preview was not requested');
    }
    this.#state = { state: 'preview', draft: deepFreeze(structuredClone(draft)) };
  }

  beginApply(currentRevision: number) {
    if (this.#state.state !== 'preview') {
      throw new Error('No AI draft is ready to apply');
    }
    if (this.#state.draft.baseRevision !== currentRevision) {
      this.#state = { state: 'stale', draft: this.#state.draft, reason: 'The story changed after this preview.' };
      return undefined;
    }
    this.#state = { state: 'applying', draft: this.#state.draft };
    return this.#state.draft.id;
  }

  stale(reason = 'The story changed after this preview.') {
    if (this.#state.state !== 'preview' && this.#state.state !== 'applying') {
      return;
    }
    this.#state = { state: 'stale', draft: this.#state.draft, reason };
  }

  finishApply() {
    if (this.#state.state !== 'applying') {
      throw new Error('No AI draft is being applied');
    }
    this.#state = { state: 'idle' };
  }

  discard() {
    this.#state = { state: 'idle' };
  }

  fail(message: string) {
    this.#state = { state: 'error', message };
  }
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
};
