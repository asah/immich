import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  StoryAiApplyResponseDto,
  StoryAiConsentDto,
  StoryAiConsentResponseDto,
  StoryAiDraftApplyDto,
  StoryAiDraftCreateDto,
  StoryAiDraftResponseDto,
  StoryAiProviderResponseDto,
  StoryAiProviderUpdateDto,
} from 'src/dtos/story-ai.dto';
import { StoryCommand, StoryCommandBatchDto, StoryDocument } from 'src/dtos/story.dto';
import { ConfigRepository } from 'src/repositories/config.repository';
import { StoryAiRepository } from 'src/repositories/story-ai.repository';
import { StoryAiProviderService, StoryAiThumbnail } from 'src/services/story-ai-provider.service';
import { StoryAiThumbnailService } from 'src/services/story-ai-thumbnail.service';
import { StoryService } from 'src/services/story.service';

const disclosure = (provider: { adapter: string; approvedEndpointId: string; model: string }) =>
  createHash('sha256')
    .update(JSON.stringify({ adapter: provider.adapter, endpoint: provider.approvedEndpointId, model: provider.model }))
    .digest();

@Injectable()
export class StoryAiService {
  constructor(
    private repository: StoryAiRepository,
    private configRepository: ConfigRepository,
    private providerAdapter: StoryAiProviderService,
    private storyService: StoryService,
    private thumbnailService: StoryAiThumbnailService,
  ) {}

  async getProvider(auth: AuthDto): Promise<StoryAiProviderResponseDto | null> {
    const provider = await this.repository.getEffectiveProvider(auth.user.id);
    if (!provider) {
      return null;
    }
    return this.mapProvider(provider, provider.userId === null ? 'server' : 'user');
  }

  async updateProvider(
    auth: AuthDto,
    dto: StoryAiProviderUpdateDto,
    serverWide = false,
  ): Promise<StoryAiProviderResponseDto> {
    const encrypted = dto.credential ? this.encrypt(dto.credential, serverWide ? null : auth.user.id) : undefined;
    const provider = await this.repository.upsertProvider({
      userId: serverWide ? null : auth.user.id,
      adapter: dto.adapter,
      approvedEndpointId: dto.approvedEndpointId,
      model: dto.model,
      enabled: dto.enabled,
      credential: encrypted,
    });
    return this.mapProvider(provider, serverWide ? 'server' : 'user');
  }

  async deleteProvider(auth: AuthDto, serverWide = false): Promise<void> {
    await this.repository.deleteProvider(serverWide ? null : auth.user.id);
  }

  async setConsent(auth: AuthDto, dto: StoryAiConsentDto): Promise<StoryAiConsentResponseDto> {
    const provider = await this.repository.getEffectiveProvider(auth.user.id);
    if (!provider || provider.id !== dto.providerId) {
      throw new BadRequestException('Provider is not active');
    }
    const consent = await this.repository.setConsent({
      userId: auth.user.id,
      providerId: provider.id,
      textAllowed: dto.textAllowed,
      thumbnailAllowed: dto.thumbnailAllowed,
      providerDisclosureHash: disclosure(provider),
    });
    return {
      providerId: consent.providerId,
      textAllowed: consent.textAllowed,
      thumbnailAllowed: consent.thumbnailAllowed,
      updatedAt: consent.updatedAt,
    };
  }

  async getConsent(auth: AuthDto): Promise<StoryAiConsentResponseDto | null> {
    const provider = await this.repository.getEffectiveProvider(auth.user.id);
    if (!provider) {
      return null;
    }
    const consent = await this.repository.getConsent(auth.user.id, provider.id);
    if (!consent || !consent.providerDisclosureHash.equals(disclosure(provider))) {
      return null;
    }
    return {
      providerId: consent.providerId,
      textAllowed: consent.textAllowed,
      thumbnailAllowed: consent.thumbnailAllowed,
      updatedAt: consent.updatedAt,
    };
  }

  async createDraft(auth: AuthDto, storyId: string, dto: StoryAiDraftCreateDto): Promise<StoryAiDraftResponseDto> {
    await this.storyService.assertEditor(auth, storyId);
    const provider = await this.repository.getEffectiveProvider(auth.user.id);
    if (!provider) {
      throw new BadRequestException('No AI provider is configured');
    }
    const consent = await this.repository.getConsent(auth.user.id, provider.id);
    if (!consent?.textAllowed || !consent.providerDisclosureHash.equals(disclosure(provider))) {
      throw new ForbiddenException('AI consent is required');
    }
    const current = await this.storyService.getDocument(auth, storyId);
    if (current.revision !== dto.baseRevision) {
      throw new ConflictException({ code: 'STALE_REVISION', currentRevision: current.revision });
    }
    const thumbnails = consent.thumbnailAllowed
      ? this.boundThumbnails(await this.thumbnailService.get(this.representativeAssetIds(current.document)))
      : undefined;
    const commands = await this.providerAdapter.propose({
      adapter: provider.adapter,
      instruction: dto.instruction,
      storyId,
      revision: current.revision,
      credential: this.decryptProviderCredential(provider),
      model: provider.model,
      thumbnails,
    });
    if (commands.length === 0 || commands.length > 100) {
      throw new BadRequestException('Provider returned no usable edits');
    }
    const preview = await this.storyService.previewCommands(auth, storyId, current.revision, commands);
    const commandHash = createHash('sha256').update(JSON.stringify(commands)).digest();
    const draft = await this.repository.createDraft({
      storyId,
      actorId: auth.user.id,
      baseRevision: current.revision,
      commands: commands as unknown as Record<string, unknown>[],
      commandHash,
      diff: { operations: commands.map(({ op }) => op), count: commands.length, pageCount: preview.pages.length },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return this.safeDraft(draft);
  }

  async getDraft(auth: AuthDto, storyId: string, draftId: string): Promise<StoryAiDraftResponseDto> {
    await this.storyService.assertViewer(auth, storyId);
    const draft = await this.repository.getDraft(draftId, storyId, auth.user.id);
    if (!draft) {
      throw new NotFoundException('AI draft not found');
    }
    return this.safeDraft(draft);
  }

  async applyDraft(
    auth: AuthDto,
    storyId: string,
    draftId: string,
    dto: StoryAiDraftApplyDto,
  ): Promise<StoryAiApplyResponseDto> {
    await this.storyService.assertEditor(auth, storyId);
    const draft = await this.repository.getDraft(draftId, storyId, auth.user.id);
    if (!draft) {
      throw new NotFoundException('AI draft not found');
    }
    if (draft.appliedRevisionId) {
      throw new ConflictException('AI draft has already been applied');
    }
    if (draft.expiresAt <= new Date()) {
      throw new ConflictException('AI draft has expired');
    }
    const commands = draft.commands as unknown as StoryCommand[];
    const actualHash = createHash('sha256').update(JSON.stringify(commands)).digest();
    if (!actualHash.equals(draft.commandHash)) {
      throw new ConflictException('AI draft integrity check failed');
    }
    const result = await this.storyService.applyAiCommands(auth, storyId, {
      ...dto,
      baseRevision: Number(draft.baseRevision),
      commands,
    } as StoryCommandBatchDto);
    await this.repository.markApplied(draft.id, result.revisionId as string);
    return result;
  }

  async deleteDraft(auth: AuthDto, storyId: string, draftId: string): Promise<void> {
    await this.storyService.assertEditor(auth, storyId);
    await this.repository.deleteDraft(draftId, storyId, auth.user.id);
  }

  private encrypt(secret: string, userId: string | null) {
    const key = this.getKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`story-ai:${userId ?? 'server'}:v1`));
    const encryptedBytes = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return {
      encryptedBytes,
      nonce,
      authenticationTag: cipher.getAuthTag(),
      fingerprint: createHash('sha256').update(secret).digest('hex').slice(-12),
    };
  }

  private decryptProviderCredential(provider: Awaited<ReturnType<StoryAiRepository['getEffectiveProvider']>>) {
    if (!provider?.encryptedBytes || !provider.nonce || !provider.authenticationTag) {
      return;
    }
    const decipher = createDecipheriv('aes-256-gcm', this.getKey(), provider.nonce);
    decipher.setAAD(Buffer.from(`story-ai:${provider.userId ?? 'server'}:v${provider.masterKeyVersion}`));
    decipher.setAuthTag(provider.authenticationTag);
    return Buffer.concat([decipher.update(provider.encryptedBytes), decipher.final()]).toString('utf8');
  }

  private getKey() {
    const encoded = this.configRepository.getEnv().aiCredentialKey;
    if (!encoded) {
      throw new BadRequestException('AI credential encryption is not configured');
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) {
      throw new BadRequestException('AI credential encryption key must be exactly 32 bytes');
    }
    return key;
  }

  private representativeAssetIds(document: StoryDocument): string[] {
    return [
      ...[document.cover, ...document.pages].flatMap((scene) =>
        scene.elements.flatMap((element) => (element.assetId ? [element.assetId] : [])),
      ),
      ...document.unplacedAssetIds,
    ];
  }

  private boundThumbnails(thumbnails: StoryAiThumbnail[]): StoryAiThumbnail[] {
    const bounded: StoryAiThumbnail[] = [];
    let totalBytes = 0;
    for (const thumbnail of thumbnails) {
      const byteLength = Buffer.byteLength(thumbnail.base64, 'base64');
      if (bounded.length >= 8 || byteLength > 16_000 || totalBytes + byteLength > 96_000) {
        continue;
      }
      totalBytes += byteLength;
      bounded.push(thumbnail);
    }
    return bounded;
  }

  private mapProvider(
    provider: {
      id: string;
      adapter: string;
      approvedEndpointId: string;
      model: string;
      enabled: boolean;
      fingerprint?: string | null;
    },
    scope: 'server' | 'user',
  ): StoryAiProviderResponseDto {
    return {
      id: provider.id,
      adapter: provider.adapter as StoryAiProviderResponseDto['adapter'],
      approvedEndpointId: provider.approvedEndpointId,
      model: provider.model,
      enabled: provider.enabled,
      credentialFingerprint: provider.fingerprint ?? null,
      scope,
    };
  }

  private safeDraft(draft: Awaited<ReturnType<StoryAiRepository['createDraft']>>): StoryAiDraftResponseDto {
    return {
      id: draft.id,
      storyId: draft.storyId,
      actorId: draft.actorId,
      baseRevision: Number(draft.baseRevision),
      commandSchemaVersion: draft.commandSchemaVersion,
      commands: draft.commands as unknown as StoryCommand[],
      diff: draft.diff,
      expiresAt: draft.expiresAt,
      createdAt: draft.createdAt,
      appliedRevisionId: draft.appliedRevisionId,
    };
  }
}
