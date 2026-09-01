import { BadRequestException, Injectable } from '@nestjs/common';
import { Activity } from 'src/database';
import {
  ActivityCreateDto,
  ActivityDto,
  ActivityResponseDto,
  ActivitySearchDto,
  ActivityStatisticsResponseDto,
  mapActivity,
  MaybeDuplicate,
  ReactionLevel,
  ReactionType,
} from 'src/dtos/activity.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { Permission } from 'src/enum';
import { BaseService } from 'src/services/base.service';

const sanitizeCommentDocument = (document?: string | null) => {
  if (!document) {
    return null;
  }

  return document
    .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(?:"|')?\s*javascript:[^\s"'>]+(?:"|')?/gi, '$1="#"');
};

@Injectable()
export class ActivityService extends BaseService {
  async getAll(auth: AuthDto, dto: ActivitySearchDto): Promise<ActivityResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.AlbumRead, ids: [dto.albumId] });
    const activities = await this.activityRepository.search({
      userId: dto.userId,
      albumId: dto.albumId,
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
    await this.requireAccess({ auth, permission: Permission.AlbumRead, ids: [dto.albumId] });
    return await this.activityRepository.getStatistics({ albumId: dto.albumId, assetId: dto.assetId });
  }

  async create(auth: AuthDto, dto: ActivityCreateDto): Promise<MaybeDuplicate<ActivityResponseDto>> {
    await this.requireAccess({ auth, permission: Permission.ActivityCreate, ids: [dto.albumId] });

    let parent: Awaited<ReturnType<typeof this.activityRepository.getById>>;
    if (dto.parentActivityId) {
      parent = await this.activityRepository.getById(dto.parentActivityId);
      if (!parent || parent.albumId !== dto.albumId || parent.isLiked) {
        throw new BadRequestException('Comment reaction target not found');
      }
      if (dto.assetId && dto.assetId !== parent.assetId) {
        throw new BadRequestException('Comment reaction asset does not match its target');
      }
    }

    const attachmentIds = dto.assetIds ?? [];
    const assetsInAlbum = await this.activityRepository.getAssetsInAlbum(dto.albumId, attachmentIds);
    if (assetsInAlbum.length !== attachmentIds.length) {
      throw new BadRequestException('All attached assets must belong to the album');
    }

    const common = {
      userId: auth.user.id,
      assetId: parent?.assetId ?? dto.assetId,
      albumId: dto.albumId,
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
    if (!isDuplicate) {
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
    await this.requireAccess({ auth, permission: Permission.ActivityDelete, ids: [id] });
    await this.activityRepository.delete(id);
  }
}
