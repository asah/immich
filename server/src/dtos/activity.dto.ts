import { createZodDto } from 'nestjs-zod';
import { Activity } from 'src/database';
import { mapUser, UserResponseSchema } from 'src/dtos/user.dto';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

export enum ReactionLevel {
  ALBUM = 'album',
  ASSET = 'asset',
}
const ReactionLevelSchema = z.enum(ReactionLevel).describe('Reaction level').meta({ id: 'ReactionLevel' });

export enum ReactionType {
  COMMENT = 'comment',
  LIKE = 'like',
}
const ReactionTypeSchema = z.enum(ReactionType).describe('Reaction type').meta({ id: 'ReactionType' });

export type MaybeDuplicate<T> = { duplicate: boolean; value: T };

const ActivityResponseSchema = z
  .object({
    id: z.uuidv4().describe('Activity ID'),
    createdAt: isoDatetimeToDate.describe('Creation date'),
    user: UserResponseSchema,
    assetId: z.uuidv4().nullable().describe('Asset ID (if activity is for an asset)'),
    type: ReactionTypeSchema,
    comment: z.string().nullish().describe('Comment text (for comment activities)'),
    commentDocument: z.string().max(10_000).nullish().describe('Sanitized rich comment document'),
    reactionKey: z.string().nullish().describe('Reaction key'),
    parentActivityId: z.uuidv4().nullish().describe('Comment activity receiving a reaction'),
    assetIds: z.array(z.uuidv4()).default([]).describe('Photo attachments referenced by this activity'),
  })
  .meta({ id: 'ActivityResponseDto' });

const ActivityStatisticsResponseSchema = z
  .object({
    comments: z.int().min(0).describe('Number of comments'),
    likes: z.int().min(0).describe('Number of likes'),
  })
  .meta({ id: 'ActivityStatisticsResponseDto' });

const ActivitySchema = z.object({
  albumId: z.uuidv4().describe('Album ID'),
  assetId: z.uuidv4().optional().describe('Asset ID (if activity is for an asset)'),
});

const ActivitySearchSchema = ActivitySchema.extend({
  type: ReactionTypeSchema.optional(),
  level: ReactionLevelSchema.optional(),
  userId: z.uuidv4().optional().describe('Filter by user ID'),
  parentActivityId: z.uuidv4().nullish().describe('Filter reactions on a comment'),
});

const ActivityCreateSchema = ActivitySchema.extend({
  type: ReactionTypeSchema,
  assetId: z.uuidv4().optional().describe('Asset ID (if activity is for an asset)'),
  comment: z.string().optional().describe('Comment text (required if type is comment)'),
  commentDocument: z.string().max(10_000).optional().describe('Rich comment document'),
  reactionKey: z.string().min(1).max(64).optional().describe('Reaction key'),
  parentActivityId: z.uuidv4().optional().describe('Comment activity receiving a reaction'),
  assetIds: z.array(z.uuidv4()).max(4).optional().describe('Photo attachments referenced by this activity'),
})
  .refine((data) => data.type !== ReactionType.COMMENT || (data.comment && data.comment.trim() !== ''), {
    error: 'Comment is required when type is COMMENT',
    path: ['comment'],
  })
  .refine((data) => data.type === ReactionType.COMMENT || !data.comment, {
    error: 'Comment must not be provided when type is not COMMENT',
    path: ['comment'],
  })
  .refine((data) => data.type !== ReactionType.COMMENT || !data.reactionKey, {
    error: 'Reaction key must not be provided for comments',
    path: ['reactionKey'],
  })
  .describe('Activity create');

export const mapActivity = (activity: Activity): ActivityResponseDto => {
  return {
    id: activity.id,
    assetId: activity.assetId,
    createdAt: activity.createdAt,
    comment: activity.comment,
    commentDocument: typeof activity.commentDocument === 'string' ? activity.commentDocument : null,
    reactionKey: activity.reactionKey ?? (activity.isLiked ? ReactionType.LIKE : null),
    parentActivityId: activity.parentActivityId,
    assetIds: [],
    type: activity.isLiked ? ReactionType.LIKE : ReactionType.COMMENT,
    user: mapUser(activity.user),
  };
};

export class ActivityResponseDto extends createZodDto(ActivityResponseSchema) {}
export class ActivityCreateDto extends createZodDto(ActivityCreateSchema) {}
export class ActivityDto extends createZodDto(ActivitySchema) {}
export class ActivitySearchDto extends createZodDto(ActivitySearchSchema) {}
export class ActivityStatisticsResponseDto extends createZodDto(ActivityStatisticsResponseSchema) {}
