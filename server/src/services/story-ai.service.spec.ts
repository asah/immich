import { ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AiProviderAdapter } from 'src/enum';
import { StoryAiService } from 'src/services/story-ai.service';
import { vitest } from 'vitest';

const userId = randomUUID();
const storyId = randomUUID();
const providerId = randomUUID();
const auth = { user: { id: userId } } as any;
const provider = {
  id: providerId,
  userId,
  adapter: AiProviderAdapter.OpenAI,
  approvedEndpointId: 'openai_public',
  model: 'gpt-test',
  enabled: true,
  encryptedBytes: null,
  nonce: null,
  authenticationTag: null,
  masterKeyVersion: null,
  fingerprint: null,
};
const disclosureHash = () =>
  createHash('sha256')
    .update(JSON.stringify({ adapter: provider.adapter, endpoint: provider.approvedEndpointId, model: provider.model }))
    .digest();
const storyDocument = (assetIds: string[] = []) => ({
  schemaVersion: 1 as const,
  theme: { id: 'classic', version: 1 },
  cover: { id: randomUUID(), template: 'blank', background: 'theme', durationMs: 6000, elements: [], readingOrder: [] },
  pages: [
    { id: randomUUID(), template: 'blank', background: 'theme', durationMs: 6000, elements: [], readingOrder: [] },
  ],
  unplacedAssetIds: assetIds,
  curation: Object.fromEntries(assetIds.map((id) => [id, 'include' as const])),
});

describe(StoryAiService.name, () => {
  let repository: any;
  let stories: any;
  let adapter: any;
  let thumbnails: any;
  let service: StoryAiService;

  beforeEach(() => {
    repository = {
      getEffectiveProvider: vitest.fn(),
      upsertProvider: vitest.fn(),
      getConsent: vitest.fn(),
      createDraft: vitest.fn(),
      getDraft: vitest.fn(),
      markApplied: vitest.fn(),
    };
    stories = {
      assertEditor: vitest.fn(),
      assertViewer: vitest.fn(),
      getDocument: vitest.fn(),
      previewCommands: vitest.fn(),
      applyAiCommands: vitest.fn(),
    };
    adapter = { propose: vitest.fn() };
    thumbnails = { get: vitest.fn().mockResolvedValue([]) };
    service = new StoryAiService(
      repository,
      { getEnv: () => ({ aiCredentialKey: Buffer.alloc(32, 7).toString('base64') }) } as any,
      adapter,
      stories,
      thumbnails,
    );
  });

  it('encrypts provider credentials before persistence', async () => {
    repository.upsertProvider.mockImplementation((value: any) => ({
      ...provider,
      fingerprint: value.credential.fingerprint,
    }));
    await service.updateProvider(auth, {
      adapter: AiProviderAdapter.OpenAI,
      approvedEndpointId: 'openai_public',
      model: 'gpt-test',
      enabled: true,
      credential: 'secret-key',
    });
    const stored = repository.upsertProvider.mock.calls[0][0].credential;
    expect(stored.encryptedBytes.toString()).not.toContain('secret-key');
    expect(stored.nonce).toHaveLength(12);
    expect(stored.authenticationTag).toHaveLength(16);
  });

  it('requires current provider disclosure consent', async () => {
    repository.getEffectiveProvider.mockResolvedValue(provider);
    repository.getConsent.mockResolvedValue({ textAllowed: true, providerDisclosureHash: Buffer.alloc(32) });
    await expect(
      service.createDraft(auth, storyId, { instruction: 'theme:classic', baseRevision: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only current-user consent for the effective provider', async () => {
    const updatedAt = new Date();
    repository.getEffectiveProvider.mockResolvedValue(provider);
    repository.getConsent.mockResolvedValue({
      providerId,
      textAllowed: true,
      thumbnailAllowed: false,
      providerDisclosureHash: disclosureHash(),
      updatedAt,
      encryptedBytes: Buffer.from('must-not-leak'),
    });

    await expect(service.getConsent(auth)).resolves.toEqual({
      providerId,
      textAllowed: true,
      thumbnailAllowed: false,
      updatedAt,
    });
    expect(repository.getEffectiveProvider).toHaveBeenCalledWith(userId);
    expect(repository.getConsent).toHaveBeenCalledWith(userId, providerId);
  });

  it('returns no consent when the effective provider disclosure has changed', async () => {
    repository.getEffectiveProvider.mockResolvedValue(provider);
    repository.getConsent.mockResolvedValue({
      providerId,
      textAllowed: true,
      thumbnailAllowed: true,
      providerDisclosureHash: Buffer.alloc(32),
      updatedAt: new Date(),
    });

    await expect(service.getConsent(auth)).resolves.toBeNull();
  });

  it('does not query consent when no effective provider exists', async () => {
    repository.getEffectiveProvider.mockResolvedValue(undefined);

    await expect(service.getConsent(auth)).resolves.toBeNull();
    expect(repository.getConsent).not.toHaveBeenCalled();
  });

  it('rejects a tampered immutable draft', async () => {
    repository.getDraft.mockResolvedValue({
      id: randomUUID(),
      storyId,
      actorId: userId,
      baseRevision: 0,
      commands: [{ op: 'story.setTheme', id: 'classic', version: 1 }],
      commandHash: Buffer.alloc(32),
      expiresAt: new Date(Date.now() + 60_000),
      appliedRevisionId: null,
    });
    await expect(
      service.applyDraft(auth, storyId, randomUUID(), {
        clientMutationId: randomUUID(),
        sessionId: randomUUID(),
        clientSequence: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stories.applyAiCommands).not.toHaveBeenCalled();
  });

  it('creates a bounded draft through the adapter after consent', async () => {
    repository.getEffectiveProvider.mockResolvedValue(provider);
    repository.getConsent.mockResolvedValue({
      textAllowed: true,
      thumbnailAllowed: false,
      providerDisclosureHash: disclosureHash(),
    });
    stories.getDocument.mockResolvedValue({ revision: 3, document: storyDocument() });
    stories.previewCommands.mockResolvedValue({ pages: [{}] });
    adapter.propose.mockResolvedValue([{ op: 'story.setTheme', id: 'classic', version: 1 }]);
    repository.createDraft.mockImplementation((value: any) => value);
    const result = await service.createDraft(auth, storyId, { instruction: 'theme:classic', baseRevision: 3 });
    expect(result.commands).toHaveLength(1);
    expect(result).not.toHaveProperty('commandHash');
    expect(repository.createDraft.mock.calls[0][0].commandHash).toHaveLength(32);
    expect(thumbnails.get).not.toHaveBeenCalled();
    expect(adapter.propose.mock.calls[0][0].thumbnails).toBeUndefined();
  });

  it('passes only bounded thumbnail-source output when thumbnail consent is enabled', async () => {
    const assetIds = Array.from({ length: 20 }, () => randomUUID());
    repository.getEffectiveProvider.mockResolvedValue(provider);
    repository.getConsent.mockResolvedValue({
      textAllowed: true,
      thumbnailAllowed: true,
      providerDisclosureHash: disclosureHash(),
    });
    stories.getDocument.mockResolvedValue({ revision: 3, document: storyDocument(assetIds) });
    stories.previewCommands.mockResolvedValue({ pages: [{}] });
    adapter.propose.mockResolvedValue([{ op: 'story.setTheme', id: 'classic', version: 1 }]);
    repository.createDraft.mockImplementation((value: any) => value);
    const safeInputs = Array.from({ length: 10 }, () => ({ mimeType: 'image/jpeg', base64: 'dGlueQ==' }));
    thumbnails.get.mockResolvedValue([
      { mimeType: 'image/jpeg', base64: Buffer.alloc(16_001).toString('base64') },
      ...safeInputs,
    ]);

    await service.createDraft(auth, storyId, { instruction: 'theme:classic', baseRevision: 3 });

    expect(thumbnails.get).toHaveBeenCalledWith(assetIds);
    expect(adapter.propose.mock.calls[0][0].thumbnails).toEqual(safeInputs.slice(0, 8));
  });

  it('checks editor access before resolving a provider or invoking the adapter', async () => {
    stories.assertEditor.mockRejectedValue(new ForbiddenException());
    await expect(
      service.createDraft(auth, storyId, { instruction: 'theme:classic', baseRevision: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.getEffectiveProvider).not.toHaveBeenCalled();
    expect(adapter.propose).not.toHaveBeenCalled();
  });

  it('rechecks current Story access before returning a persisted draft', async () => {
    stories.assertViewer.mockRejectedValue(new ForbiddenException());

    await expect(service.getDraft(auth, storyId, randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.getDraft).not.toHaveBeenCalled();
  });
});
