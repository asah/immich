import { StoryAspectRatio } from '@immich/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storyService } from './story.service';

const sdk = vi.hoisted(() => ({
  applyStoryCommands: vi.fn(),
  createSharedLink: vi.fn(),
  createStory: vi.fn(),
  deleteStory: vi.fn(),
  getAllStories: vi.fn(),
  getSharedStory: vi.fn(),
  getStory: vi.fn(),
  getStoryDocument: vi.fn(),
  getStoryRevisions: vi.fn(),
  getStoryRevision: vi.fn(),
  importStoryAssets: vi.fn(),
  nameStoryRevision: vi.fn(),
  publishStory: vi.fn(),
  restoreStoryRevision: vi.fn(),
  unpublishStory: vi.fn(),
  updateStory: vi.fn(),
  updateStoryAiProvider: vi.fn(),
  getStoryUsers: vi.fn(),
  addStoryUser: vi.fn(),
  updateStoryUser: vi.fn(),
  removeStoryUser: vi.fn(),
}));
vi.mock('@immich/sdk', () => ({
  ...sdk,
  SharedLinkType: { Story: 'STORY' },
  StoryAspectRatio: { Portrait45: 'portrait_4_5' },
  State: { MustInclude: 'must_include' },
  Mode2: { Tray: 'tray' },
  Op42: { CurationSetStates: 'curation.setStates' },
  Adapter: { Openai: 'openai' },
  ApprovedEndpointId: { OpenaiPublic: 'openai_public' },
  AlbumUserRole: { Owner: 'owner', Editor: 'editor', Viewer: 'viewer' },
}));

describe('storyService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates creation to the generated SDK', async () => {
    const response = { id: 'story-id', title: 'Trip' };
    sdk.createStory.mockResolvedValue(response);
    await expect(
      storyService.create({ title: 'Trip', description: '', aspectRatio: StoryAspectRatio.Portrait45 }),
    ).resolves.toEqual(response);
    expect(sdk.createStory).toHaveBeenCalledWith({
      storyCreateDto: { title: 'Trip', description: '', aspectRatio: 'portrait_4_5' },
    });
  });

  it('supports create through published public view via generated operations', async () => {
    sdk.createStory.mockResolvedValue({ id: 'story', title: 'Trip' });
    sdk.getSharedStory.mockResolvedValue({ revisionId: 'published' });
    const story = await storyService.create({
      title: 'Trip',
      description: '',
      aspectRatio: StoryAspectRatio.Portrait45,
    });
    await storyService.importAlbum(story.id, 'album');
    await storyService.setCuration(story.id, 1, [{ assetId: 'asset', state: 'must_include' }]);
    await storyService.publish(story.id);
    await storyService.createShare(story.id, {
      description: '',
      password: '',
      slug: '',
      expiresAt: null,
      startPageId: 'page',
      startOffsetMs: 2500,
      allowDownload: true,
    });
    await expect(storyService.sharedPublished({ key: 'secret' })).resolves.toEqual({ revisionId: 'published' });
    await storyService.sharedPublished({ slug: 'password-protected-story' });
    expect(sdk.importStoryAssets).toHaveBeenCalledWith({
      id: 'story',
      storyImportDto: { albumIds: ['album'], assetIds: [], mode: 'tray' },
    });
    expect(sdk.applyStoryCommands).toHaveBeenCalledWith({
      id: 'story',
      storyCommandBatchDto: expect.objectContaining({
        baseRevision: 1,
        commands: [{ op: 'curation.setStates', states: [{ assetId: 'asset', state: 'must_include' }] }],
      }),
    });
    expect(sdk.publishStory).toHaveBeenCalledWith({ id: 'story' });
    expect(sdk.createSharedLink).toHaveBeenCalledWith({
      sharedLinkCreateDto: expect.objectContaining({
        type: 'STORY',
        storyId: 'story',
        startPageId: 'page',
        startOffsetMs: 2500,
        allowDownload: true,
      }),
    });
    expect(sdk.getSharedStory).toHaveBeenCalledWith({ key: 'secret' });
    expect(sdk.getSharedStory).toHaveBeenCalledWith({ slug: 'password-protected-story' });
  });

  it('persists BYOK setup and manages story collaborators through generated operations', async () => {
    sdk.updateStoryAiProvider.mockResolvedValue({ id: 'provider' });
    sdk.addStoryUser.mockResolvedValue([{ userId: 'user', role: 'editor' }]);
    await storyService.setupAiProvider('secret-key', 'gpt-5.6-sol');
    await storyService.addCollaborator('story', 'user', 'editor' as never);
    await storyService.updateCollaborator('story', 'user', 'viewer' as never);
    await storyService.removeCollaborator('story', 'user');
    expect(sdk.updateStoryAiProvider).toHaveBeenCalledWith({
      storyAiProviderUpdateDto: {
        adapter: 'openai',
        approvedEndpointId: 'openai_public',
        credential: 'secret-key',
        enabled: true,
        model: 'gpt-5.6-sol',
      },
    });
    expect(sdk.addStoryUser).toHaveBeenCalledWith({ id: 'story', storyUserAddDto: { userId: 'user', role: 'editor' } });
    expect(sdk.updateStoryUser).toHaveBeenCalledWith({
      id: 'story',
      userId: 'user',
      storyUserUpdateDto: { role: 'viewer' },
    });
    expect(sdk.removeStoryUser).toHaveBeenCalledWith({ id: 'story', userId: 'user' });
  });
});
