import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StoryCommandBatchDto, StoryDocument } from 'src/dtos/story.dto';
import { AlbumUserRole, AssetType, StoryAspectRatio } from 'src/enum';
import { StoryService } from 'src/services/story.service';
import { Mocked, vitest } from 'vitest';

const userId = randomUUID();
const storyId = randomUUID();
const revisionId = randomUUID();
const auth = { user: { id: userId } } as any;

const document = (): StoryDocument => ({
  schemaVersion: 1,
  theme: { id: 'classic', version: 1 },
  cover: { id: randomUUID(), template: 'blank', background: 'theme', durationMs: 6000, elements: [], readingOrder: [] },
  pages: [
    { id: randomUUID(), template: 'blank', background: 'theme', durationMs: 6000, elements: [], readingOrder: [] },
  ],
  unplacedAssetIds: [],
  curation: {},
});

describe(StoryService.name, () => {
  let service: StoryService;
  let stories: Mocked<any>;

  beforeEach(() => {
    stories = {
      create: vitest.fn(),
      get: vitest.fn(),
      getAll: vitest.fn(),
      getDocument: vitest.fn(),
      getMutation: vitest.fn(),
      commit: vitest.fn(),
      publish: vitest.fn(),
      unpublish: vitest.fn(),
      hasPublishedAsset: vitest.fn(),
      getPublished: vitest.fn(),
      getRevision: vitest.fn(),
    };
    service = new StoryService(
      stories,
      {
        asset: {
          checkOwnerAccess: vitest.fn((_userId: string, ids: Set<string>) => Promise.resolve(ids)),
          checkAlbumAccess: vitest.fn(() => Promise.resolve(new Set())),
          checkPartnerAccess: vitest.fn(() => Promise.resolve(new Set())),
        },
      } as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('creates a story with a distinct cover and initial content page', async () => {
    stories.create.mockImplementation(({ document: value }: { document: StoryDocument }) => ({
      id: storyId,
      title: 'Trip',
      description: '',
      aspectRatio: StoryAspectRatio.Portrait,
      role: AlbumUserRole.Owner,
      draftRevisionId: revisionId,
      draftRevision: 0,
      publishedRevisionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      captured: value,
    }));

    await service.create(auth, { title: 'Trip', description: '', aspectRatio: StoryAspectRatio.Portrait });

    const created = stories.create.mock.calls[0][0].document as StoryDocument;
    expect(created.cover.id).not.toBe(created.pages[0].id);
    expect(created.cover.durationMs).toBe(6000);
    expect(created.pages).toHaveLength(1);
  });

  it('allows only the owner to publish', async () => {
    stories.get.mockResolvedValue({ role: AlbumUserRole.Editor, aspectRatio: StoryAspectRatio.Portrait });
    await expect(service.publish(auth, storyId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stories.publish).not.toHaveBeenCalled();
  });

  it('returns an idempotent mutation response before replaying commands', async () => {
    const dto: StoryCommandBatchDto = {
      baseRevision: 1,
      clientMutationId: randomUUID(),
      sessionId: randomUUID(),
      clientSequence: 1,
      commands: [{ op: 'story.setTheme', id: 'classic', version: 2 }],
    };
    const response = { revisionId, revision: 2, document: document() };
    const { createHash } = await import('node:crypto');
    stories.get.mockResolvedValue({ role: AlbumUserRole.Editor, aspectRatio: StoryAspectRatio.Portrait });
    stories.getMutation.mockResolvedValue({
      requestHash: createHash('sha256').update(JSON.stringify(dto)).digest(),
      response,
    });

    await expect(service.applyCommands(auth, storyId, dto)).resolves.toEqual(response);
    expect(stories.getDocument).not.toHaveBeenCalled();
    expect(stories.commit).not.toHaveBeenCalled();
  });

  it('rejects mutation key reuse with different commands', async () => {
    const dto: StoryCommandBatchDto = {
      baseRevision: 1,
      clientMutationId: randomUUID(),
      sessionId: randomUUID(),
      clientSequence: 1,
      commands: [{ op: 'story.setTheme', id: 'classic', version: 2 }],
    };
    stories.get.mockResolvedValue({ role: AlbumUserRole.Editor });
    stories.getMutation.mockResolvedValue({ requestHash: Buffer.alloc(32), response: {} });

    await expect(service.applyCommands(auth, storyId, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('never serves a shared original when downloads are disabled', async () => {
    await expect(
      service.downloadSharedOriginal({ ...auth, sharedLink: { storyId, allowDownload: false } } as any, randomUUID()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects video playback settings on an image element', async () => {
    const value = document();
    const elementId = randomUUID();
    value.pages[0].elements.push({
      id: elementId,
      type: 'image',
      frame: { x: 0, y: 0, width: 800, height: 1000 },
      rotation: 0,
      style: {},
      ariaHidden: true,
    });
    stories.get.mockResolvedValue({ role: AlbumUserRole.Editor });
    stories.getMutation.mockResolvedValue(undefined);
    stories.getDocument.mockResolvedValue({ revisionId, revision: 0, document: value });
    await expect(
      service.applyCommands(auth, storyId, {
        baseRevision: 0,
        clientMutationId: randomUUID(),
        sessionId: randomUUID(),
        clientSequence: 1,
        commands: [
          {
            op: 'element.setVideoPlayback',
            sceneId: value.pages[0].id,
            elementId,
            mode: 'autoplay',
            delayMs: 0,
          },
        ],
      }),
    ).rejects.toThrow('Video playback applies only to video elements');
  });

  it('persists curation states in the canonical command revision', async () => {
    const value = document();
    const assetId = randomUUID();
    value.unplacedAssetIds = [assetId];
    value.curation = { [assetId]: 'include' };
    stories.get.mockResolvedValue({ role: AlbumUserRole.Editor, aspectRatio: StoryAspectRatio.Portrait });
    stories.getMutation.mockResolvedValue(undefined);
    stories.getDocument.mockResolvedValue({ revisionId, revision: 0, document: value });
    stories.commit.mockImplementation((input: any) => input);

    const result = await service.applyCommands(auth, storyId, {
      baseRevision: 0,
      clientMutationId: randomUUID(),
      sessionId: randomUUID(),
      clientSequence: 1,
      commands: [{ op: 'curation.setStates', states: [{ assetId, state: 'must_include' }] }],
    });

    expect((result.document as StoryDocument).curation).toEqual({ [assetId]: 'must_include' });
  });

  it('updates accessibility and canonical reading order together', async () => {
    const value = document();
    const elementId = randomUUID();
    value.pages[0].elements.push({
      id: elementId,
      type: 'text',
      text: 'Caption',
      frame: { x: 0, y: 0, width: 400, height: 100 },
      rotation: 0,
      style: {},
      ariaHidden: true,
    });
    stories.get.mockResolvedValue({ role: AlbumUserRole.Editor, aspectRatio: StoryAspectRatio.Portrait });
    stories.getMutation.mockResolvedValue(undefined);
    stories.getDocument.mockResolvedValue({ revisionId, revision: 0, document: value });
    stories.commit.mockImplementation((input: any) => input);

    const result = await service.applyCommands(auth, storyId, {
      baseRevision: 0,
      clientMutationId: randomUUID(),
      sessionId: randomUUID(),
      clientSequence: 1,
      commands: [
        {
          op: 'element.setAccessibility',
          sceneId: value.pages[0].id,
          elementId,
          ariaHidden: false,
          altText: 'Accessible caption',
        },
      ],
    });

    const page = (result.document as StoryDocument).pages[0];
    expect(page.elements[0]).toMatchObject({ ariaHidden: false, altText: 'Accessible caption' });
    expect(page.readingOrder).toEqual([elementId]);
  });

  it('does not fall back to a video original when no encoded rendition exists', async () => {
    stories.hasPublishedAsset.mockResolvedValue(true);
    (service as any).assetRepository.getForVideo = vitest.fn(() =>
      Promise.resolve({ originalPath: '/private/original.mov', encodedVideoPath: null }),
    );
    await expect(
      service.getSharedVideo({ ...auth, sharedLink: { storyId, allowDownload: true } } as any, randomUUID()),
    ).rejects.toThrow('Encoded story video is not available');
  });

  it('serves an encoded revision video to a viewer collaborator', async () => {
    const assetId = randomUUID();
    const value = document();
    value.pages[0].elements.push({
      id: randomUUID(),
      type: 'video',
      assetId,
      frame: { x: 0, y: 0, width: 800, height: 1000 },
      rotation: 0,
      style: {},
      ariaHidden: false,
    });
    stories.get.mockResolvedValue({ role: AlbumUserRole.Viewer });
    stories.getRevision.mockResolvedValue({ document: value });
    (service as any).assetRepository.getByIds = vitest.fn(() =>
      Promise.resolve([{ id: assetId, type: AssetType.Video, deletedAt: null }]),
    );
    (service as any).assetRepository.getForVideo = vitest.fn(() =>
      Promise.resolve({ encodedVideoPath: '/encoded/video.mp4', originalPath: '/private/original.mov' }),
    );

    const response = await service.getRevisionVideo(auth, storyId, revisionId, assetId);

    expect(response.path).toBe('/encoded/video.mp4');
  });

  it('denies a revision video after story access is lost', async () => {
    stories.get.mockResolvedValue(undefined);

    await expect(service.getRevisionVideo(auth, storyId, revisionId, randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(stories.getRevision).not.toHaveBeenCalled();
  });

  it('returns only the exact published document and clamps its shared start', async () => {
    const value = document();
    value.pages[0].durationMs = 6000;
    stories.getPublished.mockResolvedValue({
      id: storyId,
      title: 'Trip',
      description: '',
      aspectRatio: StoryAspectRatio.Portrait,
      revisionId,
      document: value,
    });
    const result = await service.getShared({
      ...auth,
      sharedLink: { storyId, startPageId: value.pages[0].id, startOffsetMs: 9000 },
    } as any);
    expect(result.revisionId).toBe(revisionId);
    expect(result.document).toBe(value);
    expect(result.resolvedStart).toEqual({ pageId: value.pages[0].id, offsetMs: 6000 });
  });

  it('maps a concurrent mutation uniqueness race to a clean conflict', async () => {
    const value = document();
    stories.get.mockResolvedValue({ role: AlbumUserRole.Editor, aspectRatio: StoryAspectRatio.Portrait });
    stories.getMutation.mockResolvedValue(undefined);
    stories.getDocument.mockResolvedValue({ revisionId, revision: 0, document: value });
    stories.commit.mockRejectedValue({ code: '23505' });
    await expect(
      service.applyCommands(auth, storyId, {
        baseRevision: 0,
        clientMutationId: randomUUID(),
        sessionId: randomUUID(),
        clientSequence: 1,
        commands: [{ op: 'story.setTheme', id: 'classic', version: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
