import {
  applyStoryCommands,
  createSharedLink,
  createStory,
  deleteStory,
  getAllStories,
  getSharedStory,
  getStoryAiProvider,
  getStoryAiConsent,
  getStory,
  getStoryDocument,
  getStoryRevisions,
  getStoryRevision,
  importStoryAssets,
  Mode2,
  nameStoryRevision,
  publishStory,
  Op42,
  restoreStoryRevision,
  SharedLinkType,
  State,
  unpublishStory,
  updateStory,
  setStoryAiConsent,
  createStoryAiDraft,
  applyStoryAiDraft,
  deleteStoryAiDraft,
  updateStoryAiProvider,
  getStoryUsers,
  addStoryUser,
  updateStoryUser,
  removeStoryUser,
  Adapter,
  ApprovedEndpointId,
  AlbumUserRole,
  type SharedStoryResponseDto,
  type StoryCommandBatchDto,
  type StoryCreateDto,
  type StoryDocumentResponseDto,
  type StoryResponseDto,
  type StoryRevisionResponseDto,
  type StoryUpdateDto,
} from '@immich/sdk';

export type {
  SharedStoryResponseDto,
  StoryCommandBatchDto,
  StoryCreateDto,
  StoryDocumentResponseDto,
  StoryResponseDto,
  StoryRevisionResponseDto,
  StoryUpdateDto,
};
export type StoryAspectRatio = StoryResponseDto['aspectRatio'];
export type StoryDocumentDto = StoryDocumentResponseDto['document'];
export type SharedPublishedStoryDto = SharedStoryResponseDto;
export type StoryDetail = {
  story: StoryResponseDto;
  document: StoryDocumentResponseDto;
  revisions: StoryRevisionResponseDto[];
};

export const storyService = {
  list: () => getAllStories(),
  create: (dto: StoryCreateDto) => createStory({ storyCreateDto: dto }),
  get: (id: string) => getStory({ id }),
  update: (id: string, dto: StoryUpdateDto) => updateStory({ id, storyUpdateDto: dto }),
  remove: (id: string) => deleteStory({ id }),
  document: (id: string) => getStoryDocument({ id }),
  revisions: (id: string) => getStoryRevisions({ id }),
  apply: (id: string, dto: StoryCommandBatchDto) => applyStoryCommands({ id, storyCommandBatchDto: dto }),
  publish: (id: string) => publishStory({ id }),
  unpublish: (id: string) => unpublishStory({ id }),
  restore: (id: string, revisionId: string) => restoreStoryRevision({ id, revisionId }),
  nameRevision: (id: string, revisionId: string, name: string | null) =>
    nameStoryRevision({ id, revisionId, storyRevisionNameDto: { name } }),
  importAlbum: (id: string, albumId: string) =>
    importStoryAssets({ id, storyImportDto: { albumIds: [albumId], assetIds: [], mode: Mode2.Tray } }),
  importAlbums: (id: string, albumIds: string[]) =>
    importStoryAssets({ id, storyImportDto: { albumIds, assetIds: [], mode: Mode2.Tray } }),
  importSelection: (id: string, albumIds: string[], assetIds: string[], automatic = false) =>
    importStoryAssets({
      id,
      storyImportDto: { albumIds, assetIds, mode: automatic ? Mode2.AutomaticDraft : Mode2.Tray },
    }),
  placeAsset: (id: string, assetId: string) =>
    importStoryAssets({ id, storyImportDto: { albumIds: [], assetIds: [assetId], mode: Mode2.OnePerPage } }),
  createShare: (
    storyId: string,
    options: {
      description: string;
      password: string;
      slug: string;
      expiresAt: string | null;
      startPageId: string | null;
      startOffsetMs: number | null;
      allowDownload: boolean;
    },
  ) =>
    createSharedLink({
      sharedLinkCreateDto: {
        type: SharedLinkType.Story,
        storyId,
        ...options,
        allowUpload: false,
        allowDownload: options.allowDownload,
        showMetadata: false,
      },
    }),
  sharedPublished: (params: { key?: string; slug?: string } = {}) => getSharedStory(params),
  revision: (id: string, revisionId: string) => getStoryRevision({ id, revisionId }),
  aiProvider: () => getStoryAiProvider(),
  aiConsent: (providerId: string, textAllowed: boolean, thumbnailAllowed: boolean) =>
    setStoryAiConsent({ storyAiConsentDto: { providerId, textAllowed, thumbnailAllowed } }),
  getAiConsent: () => getStoryAiConsent(),
  aiDraft: (storyId: string, baseRevision: number, instruction: string) =>
    createStoryAiDraft({ storyId, storyAiDraftCreateDto: { baseRevision, instruction } }),
  applyAiDraft: (storyId: string, draftId: string) =>
    applyStoryAiDraft({
      storyId,
      draftId,
      storyAiDraftApplyDto: {
        clientMutationId: crypto.randomUUID(),
        clientSequence: 1,
        sessionId: crypto.randomUUID(),
      },
    }),
  discardAiDraft: (storyId: string, draftId: string) => deleteStoryAiDraft({ storyId, draftId }),
  setupAiProvider: (credential: string, model: string) =>
    updateStoryAiProvider({
      storyAiProviderUpdateDto: {
        adapter: Adapter.Openai,
        approvedEndpointId: ApprovedEndpointId.OpenaiPublic,
        credential,
        enabled: true,
        model,
      },
    }),
  collaborators: (id: string) => getStoryUsers({ id }),
  addCollaborator: (id: string, userId: string, role: AlbumUserRole.Editor | AlbumUserRole.Viewer) =>
    addStoryUser({ id, storyUserAddDto: { userId, role } }),
  updateCollaborator: (id: string, userId: string, role: AlbumUserRole.Editor | AlbumUserRole.Viewer) =>
    updateStoryUser({ id, userId, storyUserUpdateDto: { role } }),
  removeCollaborator: (id: string, userId: string) => removeStoryUser({ id, userId }),
  setCuration: (
    id: string,
    revision: number,
    states: Array<{ assetId: string; state: NonNullable<StoryDocumentDto['curation']>[string] }>,
  ) =>
    applyStoryCommands({
      id,
      storyCommandBatchDto: {
        baseRevision: revision,
        clientMutationId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        clientSequence: 1,
        commands: [
          {
            op: Op42.CurationSetStates,
            states: states.map(({ assetId, state }) => ({ assetId, state: state as State })),
          },
        ],
      },
    }),
  async detail(id: string): Promise<StoryDetail> {
    const [story, document, revisions] = await Promise.all([this.get(id), this.document(id), this.revisions(id)]);
    return { story, document, revisions };
  },
};
