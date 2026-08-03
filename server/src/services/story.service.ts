import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PostgresError } from 'postgres';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  StoryCommand,
  StoryCommandBatchDto,
  StoryCreateDto,
  StoryDocument,
  StoryImportDto,
  StoryRevisionNameDto,
  StoryRevisionSearchDto,
  StoryUpdateDto,
  StoryUserAddDto,
  StoryUserUpdateDto,
} from 'src/dtos/story.dto';
import {
  AlbumUserRole,
  AssetFileType,
  AssetType,
  CacheControl,
  Permission,
  StoryAspectRatio,
  StoryRevisionSource,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { StoryCommandResult, StoryRepository } from 'src/repositories/story.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { checkAccess, requireAccess } from 'src/utils/access';
import { getFilenameExtension, ImmichFileResponse } from 'src/utils/file';
import { mimeTypes } from 'src/utils/mime-types';

const makeEmptyScene = () => ({
  id: randomUUID(),
  template: 'blank',
  background: 'theme',
  durationMs: 6000,
  elements: [],
  readingOrder: [],
});
const themes = new Set(['classic', 'minimal', 'playful']);
const templates = new Set(['blank', 'full_bleed', 'split', 'title']);
const textStyleKeys = new Set([
  'font',
  'size',
  'weight',
  'lineHeight',
  'letterSpacing',
  'alignment',
  'color',
  'treatment',
]);
const fonts = new Set(['inter', 'libre-baskerville', 'source-sans-3']);
const builtInStickerTokens = new Set(['builtin:heart', 'builtin:star', 'builtin:sparkles', 'builtin:speech-bubble']);
const styleKeys = new Map([
  ['image', new Set(['fit', 'opacity', 'cornerRadius', 'focalX', 'focalY'])],
  ['video', new Set<string>()],
  ['text', textStyleKeys],
  ['sticker', new Set(['stickerToken', 'opacity', 'cornerRadius'])],
  ['shape', new Set(['shape', 'fill', 'opacity', 'cornerRadius'])],
]);

@Injectable()
export class StoryService {
  constructor(
    private storyRepository: StoryRepository,
    private accessRepository: AccessRepository,
    private albumRepository: AlbumRepository,
    private userRepository: UserRepository,
    private assetRepository: AssetRepository,
  ) {}

  async create(auth: AuthDto, dto: StoryCreateDto) {
    const document = this.emptyDocument();
    const story = await this.storyRepository.create({ ...dto, ownerId: auth.user.id, document });
    return this.mapStory(story);
  }

  async getAll(auth: AuthDto) {
    const stories = await this.storyRepository.getAll(auth.user.id);
    return stories.map((story) => this.mapStory(story));
  }

  async get(auth: AuthDto, id: string) {
    return this.mapStory(await this.requireRole(auth, id, AlbumUserRole.Viewer));
  }

  async update(auth: AuthDto, id: string, dto: StoryUpdateDto) {
    await this.requireRole(auth, id, AlbumUserRole.Editor);
    await this.storyRepository.update(id, dto);
    return this.get(auth, id);
  }

  async remove(auth: AuthDto, id: string) {
    await this.requireRole(auth, id, AlbumUserRole.Owner);
    await this.storyRepository.remove(id);
  }

  async getDocument(auth: AuthDto, id: string) {
    await this.requireRole(auth, id, AlbumUserRole.Viewer);
    const revision = await this.storyRepository.getDocument(id);
    if (!revision) {
      throw new NotFoundException('Story document not found');
    }
    return { ...revision, revision: Number(revision.revision), document: revision.document as StoryDocument };
  }

  async applyCommands(auth: AuthDto, id: string, dto: StoryCommandBatchDto) {
    return this.applyCommandBatch(auth, id, dto, StoryRevisionSource.Manual);
  }

  async applyAiCommands(auth: AuthDto, id: string, dto: StoryCommandBatchDto) {
    return this.applyCommandBatch(auth, id, dto, StoryRevisionSource.Ai);
  }

  async assertEditor(auth: AuthDto, id: string) {
    await this.requireRole(auth, id, AlbumUserRole.Editor);
  }

  async assertViewer(auth: AuthDto, id: string) {
    await this.requireRole(auth, id, AlbumUserRole.Viewer);
  }

  async previewCommands(auth: AuthDto, id: string, baseRevision: number, commands: StoryCommand[]) {
    const story = await this.requireRole(auth, id, AlbumUserRole.Editor);
    const current = await this.getDocument(auth, id);
    if (current.revision !== baseRevision) {
      throw new ConflictException({ code: 'STALE_REVISION', currentRevision: current.revision });
    }
    const document = structuredClone(current.document);
    for (const command of commands) {
      this.applyCommand(document, command);
    }
    await this.validateAssets(auth, document);
    this.validateDocument(document, story.aspectRatio);
    return document;
  }

  private async applyCommandBatch(auth: AuthDto, id: string, dto: StoryCommandBatchDto, source: StoryRevisionSource) {
    const story = await this.requireRole(auth, id, AlbumUserRole.Editor);
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest();
    const replay = await this.storyRepository.getMutation(id, dto.clientMutationId, dto.sessionId, dto.clientSequence);
    if (replay) {
      if (!replay.requestHash.equals(requestHash)) {
        throw new ConflictException('Mutation ID or sequence has already been used');
      }
      return replay.response as StoryCommandResult;
    }
    const current = await this.getDocument(auth, id);
    const document = structuredClone(current.document);
    for (const command of dto.commands) {
      this.applyCommand(document, command);
    }
    await this.validateAssets(auth, document);
    this.validateDocument(document, story.aspectRatio);
    try {
      return await this.storyRepository.commit({
        storyId: id,
        actorId: auth.user.id,
        baseRevision: dto.baseRevision,
        document,
        source,
        summary: this.summarize(dto.commands),
        mutation: {
          clientMutationId: dto.clientMutationId,
          sessionId: dto.sessionId,
          clientSequence: dto.clientSequence,
          requestHash,
        },
      });
    } catch (error) {
      if ((error as PostgresError).code === '23505') {
        throw new ConflictException('Mutation ID or sequence has already been used');
      }
      throw error;
    }
  }

  async importAssets(auth: AuthDto, id: string, dto: StoryImportDto) {
    const story = await this.requireRole(auth, id, AlbumUserRole.Editor);
    const ids = new Set(dto.assetIds);
    for (const albumId of dto.albumIds) {
      await requireAccess(this.accessRepository, { auth, permission: Permission.AlbumRead, ids: [albumId] });
      const album = await this.albumRepository.getById(albumId, { withAssets: true }, auth.user.id);
      for (const asset of album?.assets ?? []) {
        ids.add(asset.id);
      }
    }
    const allowed = await checkAccess(this.accessRepository, { auth, permission: Permission.AssetRead, ids });
    if (allowed.size !== ids.size) {
      throw new BadRequestException('One or more assets are inaccessible');
    }
    const current = await this.getDocument(auth, id);
    const document = structuredClone(current.document);
    const existing = new Set(document.unplacedAssetIds);
    for (const assetId of ids) {
      document.curation[assetId] ??= 'include';
    }
    for (const assetId of ids) {
      if (dto.mode === 'tray') {
        existing.add(assetId);
      } else if (dto.mode === 'one_per_page') {
        existing.delete(assetId);
        const elementId = randomUUID();
        document.pages.push({
          id: randomUUID(),
          template: 'full_bleed',
          background: 'theme',
          durationMs: 6000,
          elements: [
            {
              id: elementId,
              type: 'image',
              assetId,
              frame: this.fullFrame(story.aspectRatio),
              rotation: 0,
              style: {},
              ariaHidden: false,
            },
          ],
          readingOrder: [elementId],
        });
      }
    }
    if (dto.mode === 'automatic_draft') {
      const imported = [...ids];
      const pages: StoryDocument['pages'] = [];
      const [pageWidth, pageHeight] = this.pageSize(story.aspectRatio);
      for (let index = 0; index < imported.length; index += 2) {
        const pageAssets = imported.slice(index, index + 2);
        const elements = pageAssets.map((assetId, assetIndex) => ({
          id: randomUUID(),
          type: 'image' as const,
          assetId,
          frame:
            pageAssets.length === 1
              ? { x: 0, y: 0, width: pageWidth, height: pageHeight }
              : { x: assetIndex * (pageWidth / 2), y: 0, width: pageWidth / 2, height: pageHeight },
          rotation: 0,
          style: {},
          ariaHidden: false,
        }));
        pages.push({
          id: randomUUID(),
          template: pageAssets.length === 1 ? 'full_bleed' : 'split',
          background: 'theme',
          durationMs: 6000,
          elements,
          readingOrder: elements.map(({ id }) => id),
        });
      }
      if (pages.length > 0) {
        document.pages = pages;
      }
    }
    document.unplacedAssetIds = [...existing];
    this.validateDocument(document, story.aspectRatio);
    return this.storyRepository.commit({
      storyId: id,
      actorId: auth.user.id,
      baseRevision: current.revision,
      document,
      source: StoryRevisionSource.Import,
      summary: `Imported ${ids.size} assets`,
    });
  }

  async getRevisions(auth: AuthDto, id: string, dto: StoryRevisionSearchDto) {
    await this.requireRole(auth, id, AlbumUserRole.Viewer);
    const revisions = await this.storyRepository.listRevisions(id, dto);
    return revisions.map(({ document: _, contentHash: __, revision, ...item }) => ({
      ...item,
      revision: Number(revision),
    }));
  }

  async duplicate(auth: AuthDto, id: string) {
    const story = await this.requireRole(auth, id, AlbumUserRole.Viewer);
    const { document } = await this.getDocument(auth, id);
    await this.validateAssets(auth, document);
    const copy = await this.storyRepository.create({
      title: `${story.title} (copy)`,
      description: story.description,
      aspectRatio: story.aspectRatio,
      ownerId: auth.user.id,
      document,
    });
    return this.mapStory(copy);
  }

  async restoreDeleted(auth: AuthDto, id: string) {
    if (!(await this.storyRepository.restoreDeleted(id, auth.user.id))) {
      throw new NotFoundException('Story not found');
    }
    return this.get(auth, id);
  }

  async compareRevisions(auth: AuthDto, id: string, fromId: string, toId: string) {
    await this.requireRole(auth, id, AlbumUserRole.Viewer);
    const [from, to] = await Promise.all([
      this.storyRepository.getRevision(id, fromId),
      this.storyRepository.getRevision(id, toId),
    ]);
    if (!from || !to) {
      throw new NotFoundException('Story revision not found');
    }
    const before = from.document as StoryDocument;
    const after = to.document as StoryDocument;
    return {
      fromRevision: Number(from.revision),
      toRevision: Number(to.revision),
      pageCountDelta: after.pages.length - before.pages.length,
      assetCountDelta: this.assetIds(after).size - this.assetIds(before).size,
      themeChanged: JSON.stringify(before.theme) !== JSON.stringify(after.theme),
      changed: !from.contentHash.equals(to.contentHash),
    };
  }

  async getRevision(auth: AuthDto, id: string, revisionId: string) {
    await this.requireRole(auth, id, AlbumUserRole.Viewer);
    const revision = await this.storyRepository.getRevision(id, revisionId);
    if (!revision) {
      throw new NotFoundException('Story revision not found');
    }
    return {
      ...revision,
      revision: Number(revision.revision),
      document: revision.document as StoryDocument,
      contentHash: undefined,
    };
  }

  async nameRevision(auth: AuthDto, id: string, revisionId: string, dto: StoryRevisionNameDto) {
    await this.requireRole(auth, id, AlbumUserRole.Editor);
    const revision = await this.storyRepository.nameRevision(id, revisionId, dto.name);
    if (!revision) {
      throw new NotFoundException('Story revision not found');
    }
    return {
      ...revision,
      revision: Number(revision.revision),
      document: revision.document as StoryDocument,
      contentHash: undefined,
    };
  }

  async restoreRevision(auth: AuthDto, id: string, revisionId: string) {
    const story = await this.requireRole(auth, id, AlbumUserRole.Editor);
    const [head, revision] = await Promise.all([
      this.getDocument(auth, id),
      this.storyRepository.getRevision(id, revisionId),
    ]);
    if (!revision) {
      throw new NotFoundException('Story revision not found');
    }
    const document = revision.document as StoryDocument;
    await this.validateAssets(auth, document);
    this.validateDocument(document, story.aspectRatio);
    return this.storyRepository.commit({
      storyId: id,
      actorId: auth.user.id,
      baseRevision: head.revision,
      document,
      source: StoryRevisionSource.Restore,
      summary: `Restored revision ${revision.revision}`,
    });
  }

  async publish(auth: AuthDto, id: string) {
    const story = await this.requireRole(auth, id, AlbumUserRole.Owner);
    const { document } = await this.getDocument(auth, id);
    await this.validateAssets(auth, document);
    this.validateDocument(document, story.aspectRatio);
    await this.storyRepository.publish(id);
    return this.get(auth, id);
  }

  async unpublish(auth: AuthDto, id: string) {
    await this.requireRole(auth, id, AlbumUserRole.Owner);
    await this.storyRepository.unpublish(id);
  }

  async getSharedRendition(auth: AuthDto, assetId: string) {
    const storyId = auth.sharedLink?.storyId;
    if (!storyId || !(await this.storyRepository.hasPublishedAsset(storyId, assetId))) {
      throw new NotFoundException('Story rendition not found');
    }
    const asset = await this.assetRepository.getForThumbnail(assetId, AssetFileType.Preview, true);
    if (!asset.path) {
      throw new NotFoundException('Story rendition not found');
    }
    return new ImmichFileResponse({
      fileName: `${assetId}_preview`,
      path: asset.path,
      contentType: mimeTypes.lookup(asset.path),
      cacheControl: CacheControl.PrivateWithCache,
    });
  }

  async getShared(auth: AuthDto) {
    const sharedLink = auth.sharedLink;
    const storyId = sharedLink?.storyId;
    if (!sharedLink || !storyId) {
      throw new NotFoundException('Shared story not found');
    }
    const published = await this.storyRepository.getPublished(storyId);
    if (!published) {
      throw new NotFoundException('Shared story not found');
    }
    if (!published.revisionId) {
      throw new NotFoundException('Published story revision not found');
    }
    const document = published.document as StoryDocument;
    const requestedPageId = sharedLink.startPageId;
    const page = requestedPageId ? document.pages.find(({ id }) => id === requestedPageId) : undefined;
    const startOffsetMs = Math.min(Math.max(sharedLink.startOffsetMs ?? 0, 0), page?.durationMs ?? 0);
    return {
      story: {
        id: published.id,
        title: published.title,
        description: published.description,
        aspectRatio: published.aspectRatio,
      },
      revisionId: published.revisionId,
      document,
      resolvedStart: page ? { pageId: page.id, offsetMs: startOffsetMs } : undefined,
    };
  }

  async getSharedVideo(auth: AuthDto, assetId: string) {
    await this.requireSharedAsset(auth, assetId);
    const asset = await this.assetRepository.getForVideo(assetId);
    if (!asset) {
      throw new NotFoundException('Story video not found');
    }
    if (!asset.encodedVideoPath) {
      throw new NotFoundException('Encoded story video is not available');
    }
    const path = asset.encodedVideoPath;
    return new ImmichFileResponse({
      fileName: `${assetId}${getFilenameExtension(path)}`,
      path,
      contentType: mimeTypes.lookup(path),
      cacheControl: CacheControl.PrivateWithCache,
    });
  }

  async downloadSharedOriginal(auth: AuthDto, assetId: string) {
    if (!auth.sharedLink?.allowDownload) {
      throw new ForbiddenException();
    }
    await this.requireSharedAsset(auth, assetId);
    const asset = await this.assetRepository.getForOriginal(assetId, true);
    const path = asset.editedPath || asset.originalPath;
    return new ImmichFileResponse({
      fileName: `${assetId}${getFilenameExtension(path)}`,
      path,
      contentType: mimeTypes.lookup(path),
      cacheControl: CacheControl.PrivateWithoutCache,
    });
  }

  async getRevisionRendition(auth: AuthDto, storyId: string, revisionId: string, assetId: string) {
    const story = await this.requireRole(auth, storyId, AlbumUserRole.Viewer);
    const revision = await this.storyRepository.getRevision(storyId, revisionId);
    if (!revision || !this.documentHasAsset(revision.document as StoryDocument, assetId)) {
      throw new NotFoundException('Story rendition not found');
    }
    const [currentAsset] = await this.assetRepository.getByIds([assetId]);
    if (!currentAsset || currentAsset.deletedAt) {
      throw new NotFoundException('Story rendition not found');
    }
    if (story.role !== AlbumUserRole.Viewer) {
      await requireAccess(this.accessRepository, { auth, permission: Permission.AssetRead, ids: [assetId] });
    }
    const asset = await this.assetRepository.getForThumbnail(assetId, AssetFileType.Preview, true);
    if (!asset.path) {
      throw new NotFoundException('Story rendition not found');
    }
    return new ImmichFileResponse({
      fileName: `${assetId}_preview`,
      path: asset.path,
      contentType: mimeTypes.lookup(asset.path),
      cacheControl: CacheControl.PrivateWithCache,
    });
  }

  async getRevisionVideo(auth: AuthDto, storyId: string, revisionId: string, assetId: string) {
    await this.requireRole(auth, storyId, AlbumUserRole.Viewer);
    const revision = await this.storyRepository.getRevision(storyId, revisionId);
    if (!revision || !this.documentHasAsset(revision.document as StoryDocument, assetId)) {
      throw new NotFoundException('Story video not found');
    }
    const [currentAsset] = await this.assetRepository.getByIds([assetId]);
    if (!currentAsset || currentAsset.deletedAt || currentAsset.type !== AssetType.Video) {
      throw new NotFoundException('Story video not found');
    }
    const asset = await this.assetRepository.getForVideo(assetId);
    if (!asset?.encodedVideoPath) {
      throw new NotFoundException('Encoded story video is not available');
    }
    return new ImmichFileResponse({
      fileName: `${assetId}${getFilenameExtension(asset.encodedVideoPath)}`,
      path: asset.encodedVideoPath,
      contentType: mimeTypes.lookup(asset.encodedVideoPath),
      cacheControl: CacheControl.PrivateWithCache,
    });
  }

  async getUsers(auth: AuthDto, id: string) {
    await this.requireRole(auth, id, AlbumUserRole.Viewer);
    return this.storyRepository.getUsers(id);
  }

  async addUser(auth: AuthDto, id: string, dto: StoryUserAddDto) {
    await this.requireRole(auth, id, AlbumUserRole.Owner);
    if (dto.role === AlbumUserRole.Owner) {
      throw new BadRequestException('Cannot add another owner');
    }
    if (!(await this.userRepository.get(dto.userId, {}))) {
      throw new BadRequestException('Invalid user');
    }
    await this.storyRepository.addUser(id, dto.userId, dto.role);
    return this.getUsers(auth, id);
  }

  async updateUser(auth: AuthDto, id: string, userId: string, dto: StoryUserUpdateDto) {
    await this.requireRole(auth, id, AlbumUserRole.Owner);
    if (dto.role === AlbumUserRole.Owner) {
      throw new BadRequestException('Cannot transfer story ownership');
    }
    const users = await this.storyRepository.getUsers(id);
    if (users.every((user) => user.userId !== userId || user.role === AlbumUserRole.Owner)) {
      throw new BadRequestException('Invalid collaborator');
    }
    await this.storyRepository.updateUser(id, userId, dto.role);
    return this.getUsers(auth, id);
  }

  async removeUser(auth: AuthDto, id: string, userId: string) {
    await this.requireRole(auth, id, AlbumUserRole.Owner);
    const users = await this.storyRepository.getUsers(id);
    if (users.every((user) => user.userId !== userId || user.role === AlbumUserRole.Owner)) {
      throw new BadRequestException('Invalid collaborator');
    }
    await this.storyRepository.removeUser(id, userId);
  }

  private async requireRole(auth: AuthDto, id: string, required: AlbumUserRole) {
    const story = await this.storyRepository.get(id, auth.user.id);
    if (!story) {
      throw new NotFoundException('Story not found');
    }
    const ranks = { [AlbumUserRole.Viewer]: 0, [AlbumUserRole.Editor]: 1, [AlbumUserRole.Owner]: 2 };
    if (ranks[story.role] < ranks[required]) {
      throw new ForbiddenException();
    }
    return story;
  }

  private emptyDocument(): StoryDocument {
    return {
      schemaVersion: 1,
      theme: { id: 'classic', version: 1 },
      cover: makeEmptyScene(),
      pages: [makeEmptyScene()],
      unplacedAssetIds: [],
      curation: {},
    };
  }

  private applyCommand(document: StoryDocument, command: StoryCommand) {
    switch (command.op) {
      case 'story.setTheme': {
        document.theme = { id: command.id, version: command.version };
        break;
      }
      case 'page.insert': {
        this.insertAfter(document.pages, command.page, command.afterPageId);
        break;
      }
      case 'page.remove': {
        if (document.pages.length === 1) {
          throw new BadRequestException('A story requires one page');
        }
        document.pages = document.pages.filter((page) => page.id !== command.pageId);
        break;
      }
      case 'page.move': {
        this.moveAfter(document.pages, command.pageId, command.afterPageId);
        break;
      }
      case 'scene.setTiming': {
        this.scene(document, command.sceneId).durationMs = command.durationMs;
        break;
      }
      case 'scene.setTemplate': {
        this.scene(document, command.sceneId).template = command.template;
        break;
      }
      case 'scene.setBackground': {
        this.scene(document, command.sceneId).background = command.background;
        break;
      }
      case 'element.setBorder': {
        this.element(document, command.sceneId, command.elementId).border = command.border;
        break;
      }
      case 'element.setAnimation': {
        this.element(document, command.sceneId, command.elementId).animation = command.animation;
        break;
      }
      case 'element.setTextStyle': {
        this.element(document, command.sceneId, command.elementId).style = command.style;
        break;
      }
      case 'element.setVideoPlayback': {
        const element = this.element(document, command.sceneId, command.elementId);
        if (element.type !== 'video') {
          throw new BadRequestException('Video playback applies only to video elements');
        }
        element.videoPlayback = { mode: command.mode, delayMs: command.delayMs };
        break;
      }
      case 'element.add': {
        this.insertAfter(this.scene(document, command.sceneId).elements, command.element, command.afterElementId);
        if (command.element.assetId) {
          document.curation[command.element.assetId] ??= 'include';
          document.unplacedAssetIds = document.unplacedAssetIds.filter((id) => id !== command.element.assetId);
        }
        break;
      }
      case 'element.remove': {
        const scene = this.scene(document, command.sceneId);
        const removed = scene.elements.find((element) => element.id === command.elementId);
        scene.elements = scene.elements.filter((element) => element.id !== command.elementId);
        scene.readingOrder = scene.readingOrder.filter((id) => id !== command.elementId);
        if (
          removed?.assetId &&
          !this.placedAssetIds(document).has(removed.assetId) &&
          !document.unplacedAssetIds.includes(removed.assetId)
        ) {
          document.unplacedAssetIds.push(removed.assetId);
        }
        break;
      }
      case 'element.patchGeometry': {
        Object.assign(this.element(document, command.sceneId, command.elementId), {
          frame: command.frame,
          ...(command.rotation !== undefined && { rotation: command.rotation }),
        });
        break;
      }
      case 'element.setText': {
        this.element(document, command.sceneId, command.elementId).text = command.text;
        break;
      }
      case 'element.setAccessibility': {
        const scene = this.scene(document, command.sceneId);
        const element = this.element(document, command.sceneId, command.elementId);
        element.ariaHidden = command.ariaHidden;
        element.altText = command.altText;
        scene.readingOrder = scene.readingOrder.filter((id) => id !== element.id);
        if (!element.ariaHidden) {
          scene.readingOrder.push(element.id);
        }
        break;
      }
      case 'element.moveLayer': {
        this.moveAfter(this.scene(document, command.sceneId).elements, command.elementId, command.afterElementId);
        break;
      }
      case 'scene.setReadingOrder': {
        this.scene(document, command.sceneId).readingOrder = command.elementIds;
        break;
      }
      case 'tray.addAssets': {
        const placed = this.placedAssetIds(document);
        document.unplacedAssetIds = [
          ...new Set([...document.unplacedAssetIds, ...command.assetIds.filter((assetId) => !placed.has(assetId))]),
        ];
        for (const assetId of command.assetIds) {
          document.curation[assetId] ??= 'include';
        }
        break;
      }
      case 'tray.removeAssets': {
        document.unplacedAssetIds = document.unplacedAssetIds.filter((id) => !command.assetIds.includes(id));
        const placed = this.placedAssetIds(document);
        for (const assetId of command.assetIds) {
          if (!placed.has(assetId)) {
            delete document.curation[assetId];
          }
        }
        break;
      }
      case 'curation.setStates': {
        for (const { assetId, state } of command.states) {
          if (!(assetId in document.curation)) {
            throw new BadRequestException('Curation asset is not in the story working set');
          }
          document.curation[assetId] = state;
        }
        break;
      }
    }
  }

  private validateDocument(document: StoryDocument, aspectRatio: StoryAspectRatio) {
    if (!themes.has(document.theme.id)) {
      throw new BadRequestException('Unknown story theme');
    }
    if (document.pages.length === 0 || document.pages.length > 500 || document.unplacedAssetIds.length > 2000) {
      throw new BadRequestException('Story document limits exceeded');
    }
    const ids = new Set<string>();
    let elementCount = 0;
    let textBytes = 0;
    const [pageWidth, pageHeight] = this.pageSize(aspectRatio);
    for (const scene of [document.cover, ...document.pages]) {
      if (scene.elements.length > 100 || scene.durationMs < 1000 || scene.durationMs > 60_000) {
        throw new BadRequestException('Story scene limits exceeded');
      }
      if (!templates.has(scene.template)) {
        throw new BadRequestException('Unknown story template');
      }
      if (ids.has(scene.id)) {
        throw new BadRequestException('Duplicate scene ID');
      }
      ids.add(scene.id);
      const meaningful = scene.elements.filter((element) => !element.ariaHidden).map((element) => element.id);
      if (
        new Set(scene.readingOrder).size !== scene.readingOrder.length ||
        meaningful.length !== scene.readingOrder.length ||
        meaningful.some((id) => !scene.readingOrder.includes(id))
      ) {
        throw new BadRequestException('Invalid reading order');
      }
      for (const element of scene.elements) {
        elementCount++;
        if (ids.has(element.id)) {
          throw new BadRequestException('Duplicate element ID');
        }
        ids.add(element.id);
        const geometry = [
          element.frame.x,
          element.frame.y,
          element.frame.width,
          element.frame.height,
          element.rotation,
        ];
        if (geometry.some((value) => Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-7)) {
          throw new BadRequestException('Element geometry must be quantized to 0.001 logical units');
        }
        if (
          element.frame.width <= 0 ||
          element.frame.height <= 0 ||
          element.frame.x < -pageWidth * 0.25 ||
          element.frame.y < -pageHeight * 0.25 ||
          element.frame.x + element.frame.width > pageWidth * 1.25 ||
          element.frame.y + element.frame.height > pageHeight * 1.25
        ) {
          throw new BadRequestException('Element geometry exceeds story bounds');
        }
        if ((element.type === 'image' || element.type === 'video') && !element.assetId) {
          throw new BadRequestException('Media elements require an asset');
        }
        if (element.type === 'sticker') {
          const token = element.style.stickerToken;
          const hasBuiltIn = typeof token === 'string' && builtInStickerTokens.has(token);
          if ((element.assetId ? 1 : 0) + (hasBuiltIn ? 1 : 0) !== 1) {
            throw new BadRequestException(
              'Sticker elements require exactly one raster asset or built-in sticker token',
            );
          }
        }
        const allowedStyleKeys = styleKeys.get(element.type)!;
        if (Object.keys(element.style).some((key) => !allowedStyleKeys.has(key))) {
          throw new BadRequestException(`Unknown ${element.type} style property`);
        }
        const opacity = element.style.opacity;
        if (opacity !== undefined && (typeof opacity !== 'number' || opacity < 0 || opacity > 1)) {
          throw new BadRequestException('Element opacity must be between zero and one');
        }
        if (element.type === 'image') {
          if (element.style.fit !== undefined && !['cover', 'contain'].includes(String(element.style.fit))) {
            throw new BadRequestException('Unknown image crop treatment');
          }
          for (const key of ['focalX', 'focalY'] as const) {
            const value = element.style[key];
            if (value !== undefined && (typeof value !== 'number' || value < 0 || value > 1)) {
              throw new BadRequestException('Image focal point must be normalized');
            }
          }
        }
        if ((element.type === 'text' || element.type === 'shape') && element.assetId) {
          throw new BadRequestException('Non-media elements cannot reference an asset');
        }
        if (element.type === 'text') {
          const bytes = Buffer.byteLength(element.text ?? '', 'utf8');
          if (bytes > 20_000) {
            throw new BadRequestException('Text element is too large');
          }
          textBytes += bytes;
        }
        if (element.type === 'video' && (Object.keys(element.style).length > 0 || element.animation)) {
          throw new BadRequestException('Video effects are not supported');
        }
        if (element.animation && element.animation.startMs + element.animation.durationMs > scene.durationMs) {
          throw new BadRequestException('Animation exceeds scene duration');
        }
        if (element.type === 'text' && typeof element.style.font === 'string' && !fonts.has(element.style.font)) {
          throw new BadRequestException('Unknown story font');
        }
      }
      const events = scene.elements
        .flatMap((element) =>
          element.animation
            ? [
                { at: element.animation.startMs, delta: 1 },
                { at: element.animation.startMs + element.animation.durationMs, delta: -1 },
              ]
            : [],
        )
        .sort((left, right) => left.at - right.at || left.delta - right.delta);
      let concurrent = 0;
      for (const event of events) {
        concurrent += event.delta;
        if (concurrent > 8) {
          throw new BadRequestException('Too many concurrent animations');
        }
      }
    }
    if (elementCount > 5000 || textBytes > 200_000) {
      throw new BadRequestException('Story document limits exceeded');
    }
    const placedAssetIds = this.placedAssetIds(document);
    if (document.unplacedAssetIds.some((assetId) => placedAssetIds.has(assetId))) {
      throw new BadRequestException('An asset cannot be both used and unplaced');
    }
    const workingAssetIds = new Set([...document.unplacedAssetIds, ...placedAssetIds]);
    const curationAssetIds = new Set(Object.keys(document.curation));
    if (
      workingAssetIds.size !== curationAssetIds.size ||
      [...workingAssetIds].some((assetId) => !curationAssetIds.has(assetId))
    ) {
      throw new BadRequestException('Curation state must exactly match the story working set');
    }
  }

  private async validateAssets(auth: AuthDto, document: StoryDocument) {
    const ids = this.assetIds(document);
    const allowed = await checkAccess(this.accessRepository, { auth, permission: Permission.AssetRead, ids });
    if (allowed.size !== ids.size) {
      throw new BadRequestException('One or more assets are inaccessible');
    }
    const videoElements = [document.cover, ...document.pages].flatMap((scene) =>
      scene.elements.filter((element) => element.type === 'video' && element.assetId),
    );
    const stickerAssetIds = new Set(
      [document.cover, ...document.pages]
        .flatMap((scene) => scene.elements)
        .filter((element) => element.type === 'sticker' && element.assetId)
        .map((element) => element.assetId!),
    );
    if (stickerAssetIds.size > 0) {
      const assets = await this.assetRepository.getByIds([...stickerAssetIds]);
      if (
        assets.length !== stickerAssetIds.size ||
        assets.some((asset) => asset.type !== AssetType.Image || asset.deletedAt)
      ) {
        throw new BadRequestException('Sticker assets must be accessible raster images');
      }
    }
    if (videoElements.length > 0) {
      const assets = await this.assetRepository.getByIds([
        ...new Set(videoElements.map((element) => element.assetId!)),
      ]);
      const byId = new Map(assets.map((asset) => [asset.id, asset]));
      for (const element of videoElements) {
        const asset = byId.get(element.assetId!);
        if (!asset?.width || !asset.height) {
          throw new BadRequestException('Video dimensions are unavailable');
        }
        const sourceRatio = asset.width / asset.height;
        const frameRatio = element.frame.width / element.frame.height;
        if (Math.abs(sourceRatio - frameRatio) / sourceRatio > 0.001) {
          throw new BadRequestException('Video elements must preserve source aspect ratio');
        }
      }
    }
  }

  private assetIds(document: StoryDocument) {
    const ids = new Set(document.unplacedAssetIds);
    for (const scene of [document.cover, ...document.pages]) {
      for (const element of scene.elements) {
        if (element.assetId) {
          ids.add(element.assetId);
        }
      }
    }
    return ids;
  }

  private placedAssetIds(document: StoryDocument) {
    const ids = new Set<string>();
    for (const scene of [document.cover, ...document.pages]) {
      for (const element of scene.elements) {
        if (element.assetId) {
          ids.add(element.assetId);
        }
      }
    }
    return ids;
  }

  private async requireSharedAsset(auth: AuthDto, assetId: string) {
    const storyId = auth.sharedLink?.storyId;
    if (!storyId || !(await this.storyRepository.hasPublishedAsset(storyId, assetId))) {
      throw new NotFoundException('Story rendition not found');
    }
  }

  private documentHasAsset(document: StoryDocument, assetId: string) {
    return (
      document.unplacedAssetIds.includes(assetId) ||
      [document.cover, ...document.pages].some((scene) => scene.elements.some((element) => element.assetId === assetId))
    );
  }

  private scene(document: StoryDocument, id: string) {
    const scene = [document.cover, ...document.pages].find((scene) => scene.id === id);
    if (!scene) {
      throw new BadRequestException('Scene not found');
    }
    return scene;
  }

  private element(document: StoryDocument, sceneId: string, elementId: string) {
    const element = this.scene(document, sceneId).elements.find((element) => element.id === elementId);
    if (!element) {
      throw new BadRequestException('Element not found');
    }
    return element;
  }

  private insertAfter<T extends { id: string }>(items: T[], item: T, afterId?: string | null) {
    if (items.some(({ id }) => id === item.id)) {
      throw new BadRequestException('Duplicate ID');
    }
    const index = afterId == null ? -1 : items.findIndex(({ id }) => id === afterId);
    if (afterId && index < 0) {
      throw new BadRequestException('Anchor not found');
    }
    items.splice(index + 1, 0, item);
  }

  private moveAfter<T extends { id: string }>(items: T[], id: string, afterId: string | null) {
    if (id === afterId) {
      throw new BadRequestException('Invalid move');
    }
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new BadRequestException('Item not found');
    }
    const [item] = items.splice(index, 1);
    const target = afterId == null ? -1 : items.findIndex((item) => item.id === afterId);
    if (afterId && target < 0) {
      throw new BadRequestException('Anchor not found');
    }
    items.splice(target + 1, 0, item);
  }

  private fullFrame(aspectRatio: StoryAspectRatio) {
    const [width, height] = this.pageSize(aspectRatio);
    return { x: 0, y: 0, width, height };
  }

  private pageSize(aspectRatio: StoryAspectRatio) {
    const sizes = {
      [StoryAspectRatio.Portrait]: [800, 1000],
      [StoryAspectRatio.Landscape]: [1600, 900],
      [StoryAspectRatio.Square]: [1000, 1000],
    } as const;
    return sizes[aspectRatio];
  }

  private summarize(commands: StoryCommand[]) {
    return commands.length === 1 ? commands[0].op : `${commands.length} story edits`;
  }

  private mapStory(story: Awaited<ReturnType<StoryRepository['get']>> & {}) {
    if (!story) {
      throw new NotFoundException('Story not found');
    }
    return {
      id: story.id,
      title: story.title,
      description: story.description,
      aspectRatio: story.aspectRatio,
      role: story.role,
      draftRevisionId: story.draftRevisionId!,
      draftRevision: Number(story.draftRevision),
      publishedRevisionId: story.publishedRevisionId,
      hasUnpublishedChanges: story.publishedRevisionId !== story.draftRevisionId,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    };
  }
}
