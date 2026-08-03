import { describe, expect, it } from 'vitest';
import { storyDocumentFixture } from './story-fixtures';
import { assertStoryDocument } from './story-model';

describe('story document validation', () => {
  it('accepts the canonical fixture', () => {
    expect(() => assertStoryDocument(structuredClone(storyDocumentFixture))).not.toThrow();
  });

  it('rejects duplicate scene IDs', () => {
    const document = structuredClone(storyDocumentFixture);
    document.pages[0].id = document.cover.id;
    expect(() => assertStoryDocument(document)).toThrow('Duplicate story scene');
  });

  it('rejects missing reading-order entries', () => {
    const document = structuredClone(storyDocumentFixture);
    document.cover.readingOrder = [];
    expect(() => assertStoryDocument(document)).toThrow('absent from reading order');
  });
});
