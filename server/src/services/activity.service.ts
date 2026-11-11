import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Activity } from 'src/database.js';
import {
  ActivityCreateDto,
  ActivityDto,
  ActivityResponseDto,
  ActivitySearchDto,
  ActivityStatisticsResponseDto,
  MaybeDuplicate,
  ReactionLevel,
  ReactionType,
  mapActivity,
} from 'src/dtos/activity.dto.js';
import { AuthDto } from 'src/dtos/auth.dto.js';
import { Permission } from 'src/enum.js';
import { BaseService } from 'src/services/base.service.js';

const sanitizeCommentDocument = (document?: string | null) => {
  if (!document) {
    return null;
  }

  return document
    .replaceAll(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, '')
    .replaceAll(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replaceAll(/(href|src)\s*=\s*(?:"|')?\s*javascript:[^\s"'>]+(?:"|')?/gi, '$1="#"');
};

@Injectable()
export class ActivityService extends BaseService {
  async getAll(auth: AuthDto, dto: ActivitySearchDto): Promise<ActivityResponseDto[]> {
    await this.requireActivityReadAccess(auth, dto);
    const activities = await this.activityRepository.search({
      userId: dto.userId,
      albumId: dto.albumId ?? null,
      assetId: dto.level === ReactionLevel.ALBUM ? null : dto.assetId,
      isLiked: dto.type && dto.type === ReactionType.LIKE,
      parentActivityId: dto.parentActivityId,
    });

    const assetIds = await this.activityRepository.getAssetIds(activities.map(({ id }) => id));
    const assetsByActivity = new Map<string, string[]>();
    for (const { activityId, assetId } of assetIds) {
      const ids = assetsByActivity.get(activityId) ?? [];
      ids.push(assetId);
      assetsByActivity.set(activityId, ids);
    }

    return activities.map((activity) => ({
      ...mapActivity(activity),
      assetIds: assetsByActivity.get(activity.id) ?? [],
    }));
  }

  async getStatistics(auth: AuthDto, dto: ActivityDto): Promise<ActivityStatisticsResponseDto> {
    await this.requireActivityReadAccess(auth, dto);
    return await this.activityRepository.getStatistics({ albumId: dto.albumId, assetId: dto.assetId });
  }

  async create(auth: AuthDto, dto: ActivityCreateDto): Promise<MaybeDuplicate<ActivityResponseDto>> {
    if (dto.albumId) {
      if (auth.sharedLink) {
        this.requireSignedInSharedLinkVisitor(auth);
        await this.requireAccess({ auth, permission: Permission.AlbumRead, ids: [dto.albumId] });
      } else {
        await this.requireAccess({ auth, permission: Permission.ActivityCreate, ids: [dto.albumId] });
      }
    } else {
      this.requireSignedInSharedLinkVisitor(auth);
      await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [dto.assetId!] });
    }

    let parent: Awaited<ReturnType<typeof this.activityRepository.getById>>;
    if (dto.parentActivityId) {
      parent = await this.activityRepository.getById(dto.parentActivityId);
      if (!parent || parent.albumId !== (dto.albumId ?? null) || parent.isLiked) {
        throw new BadRequestException('Comment reaction target not found');
      }
      if (dto.assetId && dto.assetId !== parent.assetId) {
        throw new BadRequestException('Comment reaction asset does not match its target');
      }
    }

    const attachmentIds = dto.assetIds ?? [];
    const assetsInAlbum = dto.albumId ? await this.activityRepository.getAssetsInAlbum(dto.albumId, attachmentIds) : [];
    if (assetsInAlbum.length !== attachmentIds.length) {
      throw new BadRequestException('All attached assets must belong to the album');
    }

    const common = {
      userId: auth.user.id,
      assetId: parent?.assetId ?? dto.assetId,
      albumId: dto.albumId ?? null,
    };

    let activity: Activity | undefined;
    let isDuplicate = false;

    if (dto.type === ReactionType.LIKE) {
      const reactionKey = dto.reactionKey ?? ReactionType.LIKE;
      [activity] = await this.activityRepository.search({
        ...common,
        // `null` will search for an album like
        assetId: parent?.assetId ?? dto.assetId ?? null,
        isLiked: true,
        parentActivityId: dto.parentActivityId ?? null,
      });
      if (activity) {
        isDuplicate = activity.reactionKey === reactionKey;
        if (!isDuplicate) {
          await this.activityRepository.updateReaction(activity.id, reactionKey);
          activity.reactionKey = reactionKey;
        }
      }
    }

    if (!activity) {
      activity = await this.activityRepository.create({
        ...common,
        isLiked: dto.type === ReactionType.LIKE,
        comment: dto.type === ReactionType.COMMENT ? dto.comment : null,
        commentDocument: dto.type === ReactionType.COMMENT ? sanitizeCommentDocument(dto.commentDocument) : null,
        reactionKey: dto.type === ReactionType.LIKE ? (dto.reactionKey ?? ReactionType.LIKE) : null,
        parentActivityId: dto.parentActivityId ?? null,
      });
    }

    await this.activityRepository.addAssets(activity.id, attachmentIds);
    if (!isDuplicate && dto.albumId) {
      await this.eventRepository.emit('ActivityCreate', {
        activityId: activity.id,
        actorId: auth.user.id,
        albumId: dto.albumId,
        assetId: activity.assetId ?? undefined,
        isLiked: activity.isLiked,
        parentActivityId: activity.parentActivityId ?? undefined,
      });
    }
    return { duplicate: isDuplicate, value: { ...mapActivity(activity), assetIds: attachmentIds } };
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    const activity = await this.activityRepository.getById(id);
    if (activity && (activity.albumId === null || auth.sharedLink)) {
      this.requireSignedInSharedLinkVisitor(auth);
      if (activity.userId !== auth.user.id) {
        throw new ForbiddenException();
      }
      await this.requireAccess({
        auth,
        permission: activity.albumId ? Permission.AlbumRead : Permission.AssetRead,
        ids: [activity.albumId ?? activity.assetId!],
      });
    } else {
      await this.requireAccess({ auth, permission: Permission.ActivityDelete, ids: [id] });
    }
    await this.activityRepository.delete(id);
  }

  private async requireActivityReadAccess(auth: AuthDto, dto: ActivityDto) {
    await this.requireAccess({
      auth,
      permission: dto.albumId ? Permission.AlbumRead : Permission.AssetRead,
      ids: [dto.albumId ?? dto.assetId!],
    });
  }

  private requireSignedInSharedLinkVisitor(auth: AuthDto) {
    if (auth.sharedLink && !auth.session) {
      throw new UnauthorizedException('Sign in to participate in photo activity');
    }
  }
}
