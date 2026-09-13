import { ShallowDehydrateObject } from 'kysely';
import { createZodDto } from 'nestjs-zod';
import { AlbumUser, AuthSharedLink } from 'src/database';
import { HistoryBuilder } from 'src/decorators';
import { BulkIdErrorReasonSchema } from 'src/dtos/asset-ids.response.dto';
import { MapAsset } from 'src/dtos/asset-response.dto';
import { UserResponseSchema, mapUser } from 'src/dtos/user.dto';
import { AlbumUserRole, AlbumUserRoleSchema, AssetOrder, AssetOrderSchema } from 'src/enum';
import { MaybeDehydrated } from 'src/types';
import { asDateTimeString } from 'src/utils/date';
import { stringToBool, toEmail } from 'src/validation';
import z from 'zod';

const AlbumSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);

const AlbumUserAddSchema = z
  .object({
    userId: z.uuidv4().describe('User ID'),
    role: AlbumUserRoleSchema.default(AlbumUserRole.Editor).optional().describe('Album user role'),
  })
  .meta({ id: 'AlbumUserAddDto' });

const AddUsersSchema = z
  .object({
    albumUsers: z.array(AlbumUserAddSchema).min(1).describe('Album users to add'),
  })
  .meta({ id: 'AddUsersDto' });

const InviteUsersSchema = z.object({ emails: z.array(toEmail).min(1).max(20) }).meta({ id: 'InviteUsersDto' });

const AlbumInviteParamSchema = z.object({
  id: z.uuidv4().describe('Album ID'),
  inviteId: z.uuidv4().describe('Invitation ID'),
});

const AlbumInviteResponseSchema = z
  .object({
    id: z.uuidv4().describe('Invitation ID'),
    email: toEmail.describe('Invitation email'),
    createdAt: z.string().meta({ format: 'date-time' }).describe('Invitation creation time'),
    expiresAt: z.string().meta({ format: 'date-time' }).describe('Invitation expiry time'),
  })
  .meta({ id: 'AlbumInviteResponseDto' });

const AlbumUserCreateSchema = z
  .object({
    userId: z.uuidv4().describe('User ID'),
    role: AlbumUserRoleSchema,
  })
  .meta({ id: 'AlbumUserCreateDto' });

const CreateAlbumSchema = z
  .object({
    albumName: z.string().describe('Album name'),
    // TODO: drop the empty-string-to-null transform in v4 (clients should send null)
    description: z
      .string()
      .nullable()
      .transform((value) => (value === '' ? null : value))
      .optional()
      .describe('Album description')
      .meta({
        ...new HistoryBuilder()
          .added('v1')
          .updated(
            'v3',
            'Sending an empty string is deprecated; send null instead. Empty strings will no longer be coerced to null in v4.',
          )
          .getExtensions(),
      }),
    albumUsers: z.array(AlbumUserCreateSchema).optional().describe('Album users'),
    assetIds: z.array(z.uuidv4()).optional().describe('Initial asset IDs'),
    slug: AlbumSlugSchema.nullable().optional().describe('Custom album URL slug'),
  })
  .meta({ id: 'CreateAlbumDto' });

const AlbumsAddAssetsSchema = z
  .object({
    albumIds: z.array(z.uuidv4()).describe('Album IDs'),
    assetIds: z.array(z.uuidv4()).describe('Asset IDs'),
  })
  .meta({ id: 'AlbumsAddAssetsDto' });

const AlbumsAddAssetsResponseSchema = z
  .object({
    success: z.boolean().describe('Operation success'),
    error: BulkIdErrorReasonSchema.optional(),
  })
  .meta({ id: 'AlbumsAddAssetsResponseDto' });

const AlbumPresentationDisplayInfoSchema = z.object({
  location: z.boolean(),
  date: z.boolean(),
  time: z.boolean(),
  filename: z.boolean(),
  description: z.boolean(),
  fileSize: z.boolean(),
  camera: z.boolean(),
  cameraSettings: z.boolean(),
  lens: z.boolean(),
  lensSettings: z.boolean(),
  reactions: z.boolean(),
});

const AlbumPresentationSortCriterionSchema = z.object({
  sortBy: z.enum([
    'dateTaken',
    'fileName',
    'fileSize',
    'tag',
    'camera',
    'lens',
    'engagement',
    'location',
    'time',
    'description',
    'cameraSettings',
    'lensSettings',
  ]),
  sortOrder: z.enum(['asc', 'desc']),
});

export const AlbumPresentationSchema = z
  .object({
    version: z.literal(1).meta({ format: 'int32' }),
    sortCriteria: z.array(AlbumPresentationSortCriterionSchema).min(1).max(4),
    showSortDividers: z.boolean(),
    rowHeight: z.int().min(100).max(400).optional(),
    instantCameraStyle: z.boolean(),
    displayInfo: AlbumPresentationDisplayInfoSchema,
  })
  .meta({ id: 'AlbumPresentationDto' });

export type AlbumPresentation = z.infer<typeof AlbumPresentationSchema>;

export const AlbumVotingSchema = z
  .object({
    enabled: z.boolean(),
    sampleSize: z.union([z.literal(10), z.literal(20), z.literal(40)]).default(20),
    allowAnonymous: z.boolean().default(true),
    leaderboardVisible: z.boolean().default(true),
    downvotesAffectRanking: z.boolean().default(false),
  })
  .meta({ id: 'AlbumVotingDto' });

export type AlbumVoting = z.infer<typeof AlbumVotingSchema>;

const UpdateAlbumSchema = z
  .object({
    albumName: z.string().optional().describe('Album name'),
    slug: AlbumSlugSchema.nullable().optional().describe('Custom album URL slug'),
    // TODO: drop the empty-string-to-null transform in v4 (clients should send null)
    description: z
      .string()
      .nullable()
      .transform((value) => (value === '' ? null : value))
      .optional()
      .describe('Album description')
      .meta({
        ...new HistoryBuilder()
          .added('v1')
          .updated(
            'v3',
            'Sending an empty string is deprecated; send null instead. Empty strings will no longer be coerced to null in v4.',
          )
          .getExtensions(),
      }),
    albumThumbnailAssetId: z.uuidv4().optional().describe('Album thumbnail asset ID'),
    isActivityEnabled: z.boolean().optional().describe('Enable activity feed'),
    order: AssetOrderSchema.optional(),
    presentation: AlbumPresentationSchema.nullish().describe('Owner-published album presentation'),
    voting: AlbumVotingSchema.nullish().describe('Owner-controlled community voting settings'),
  })
  .meta({ id: 'UpdateAlbumDto' });

const GetAlbumsSchema = z
  .object({
    id: z.uuidv4().optional().describe('Album ID'),
    name: z.string().optional().describe('Album name (exact match)'),
    isOwned: stringToBool
      .optional()
      .describe('Filter by ownership: true = only owned, false = only shared-with-me, undefined = no filter'),
    isShared: stringToBool
      .optional()
      .describe('Filter by shared status: true = only shared, false = not shared, undefined = no filter'),
    assetId: z.uuidv4().optional().describe('Filter albums containing this asset ID (ignores other parameters)'),
    slug: AlbumSlugSchema.optional().describe('Album URL slug (exact match)'),
  })
  .meta({ id: 'GetAlbumsDto' });

const AlbumStatisticsResponseSchema = z
  .object({
    owned: z.int().min(0).describe('Number of owned albums'),
    shared: z.int().min(0).describe('Number of shared albums'),
    notShared: z.int().min(0).describe('Number of non-shared albums'),
  })
  .meta({ id: 'AlbumStatisticsResponseDto' });

const UpdateAlbumUserSchema = z
  .object({
    role: AlbumUserRoleSchema,
  })
  .meta({ id: 'UpdateAlbumUserDto' });

const AlbumUserResponseSchema = z
  .object({
    user: UserResponseSchema,
    role: AlbumUserRoleSchema,
  })
  .meta({ id: 'AlbumUserResponseDto' });

const ContributorCountResponseSchema = z
  .object({
    userId: z.uuidv4().describe('User ID'),
    assetCount: z.int().min(0).describe('Number of assets contributed'),
  })
  .meta({ id: 'ContributorCountResponseDto' });

export const AlbumResponseSchema = z
  .object({
    id: z.uuidv4().describe('Album ID'),
    albumName: z.string().describe('Album name'),
    slug: z.string().nullable().describe('Custom album URL slug'),
    description: z
      .string()
      .describe('Album description')
      .meta({
        ...new HistoryBuilder()
          .added('v1')
          .updated(
            'v3',
            'An empty string is returned instead of null for backwards compatibility; null will be returned in v4.',
          )
          .getExtensions(),
      }),
    // TODO: use `isoDatetimeToDate` when using `ZodSerializerDto` on the controllers.
    createdAt: z.string().meta({ format: 'date-time' }).describe('Creation date'),
    // TODO: use `isoDatetimeToDate` when using `ZodSerializerDto` on the controllers.
    updatedAt: z.string().meta({ format: 'date-time' }).describe('Last update date'),
    albumThumbnailAssetId: z.uuidv4().nullable().describe('Thumbnail asset ID'),
    shared: z.boolean().describe('Is shared album'),
    albumUsers: z
      .array(AlbumUserResponseSchema)
      .min(1)
      .describe(
        'First entry is always the album owner. Second entry is the auth user, if it differs from the owner. The rest are ordered alphabetically.',
      ),
    hasSharedLink: z.boolean().describe('Has shared link'),
    assetCount: z.int().min(0).describe('Number of assets'),
    // TODO: use `isoDatetimeToDate` when using `ZodSerializerDto` on the controllers.
    lastModifiedAssetTimestamp: z
      .string()
      .meta({ format: 'date-time' })
      .optional()
      .describe('Last modified asset timestamp'),
    // TODO: use `isoDatetimeToDate` when using `ZodSerializerDto` on the controllers.
    startDate: z
      .string()
      .meta({ format: 'date-time' })
      .optional()
      .describe('UTC representation of (local) start date (earliest asset)'),
    // TODO: use `isoDatetimeToDate` when using `ZodSerializerDto` on the controllers.
    endDate: z
      .string()
      .meta({ format: 'date-time' })
      .optional()
      .describe('UTC representation of (local) end date (latest asset)'),
    isActivityEnabled: z.boolean().describe('Activity feed enabled'),
    order: AssetOrderSchema.optional(),
    presentation: AlbumPresentationSchema.nullable().describe('Owner-published album presentation'),
    voting: AlbumVotingSchema.nullable().describe('Owner-controlled community voting settings'),
    contributorCounts: z.array(ContributorCountResponseSchema).optional(),
  })
  .meta({ id: 'AlbumResponseDto' });

const AlbumUserParamSchema = z.object({
  id: z.uuidv4().describe('Album ID'),
  // TODO: disallow 'me' as a shortcut in v4 and type userId as uuidv4
  userId: z
    .string()
    .refine((value) => value === 'me' || z.uuidv4().safeParse(value).success, {
      error: 'Must be a UUID v4 or "me"',
    })
    .describe('Album user ID, or "me" to reference the current user.')
    .meta(new HistoryBuilder().updated('v3', '"me" as a value is deprecated').getExtensions()),
});

export class AlbumUserParamDto extends createZodDto(AlbumUserParamSchema) {}
export class AddUsersDto extends createZodDto(AddUsersSchema) {}
export class InviteUsersDto extends createZodDto(InviteUsersSchema) {}
export class AlbumInviteParamDto extends createZodDto(AlbumInviteParamSchema) {}
export class AlbumInviteResponseDto extends createZodDto(AlbumInviteResponseSchema) {}
export class AlbumUserCreateDto extends createZodDto(AlbumUserCreateSchema) {}
export class CreateAlbumDto extends createZodDto(CreateAlbumSchema) {}
export class AlbumsAddAssetsDto extends createZodDto(AlbumsAddAssetsSchema) {}
export class AlbumsAddAssetsResponseDto extends createZodDto(AlbumsAddAssetsResponseSchema) {}
export class UpdateAlbumDto extends createZodDto(UpdateAlbumSchema) {}
export class GetAlbumsDto extends createZodDto(GetAlbumsSchema) {}
export class AlbumStatisticsResponseDto extends createZodDto(AlbumStatisticsResponseSchema) {}
export class UpdateAlbumUserDto extends createZodDto(UpdateAlbumUserSchema) {}
export class AlbumResponseDto extends createZodDto(AlbumResponseSchema) {}
class AlbumUserResponseDto extends createZodDto(AlbumUserResponseSchema) {}

export type MapAlbumDto = {
  albumUsers?: AlbumUser[];
  assets?: ShallowDehydrateObject<MapAsset>[];
  sharedLinks?: ShallowDehydrateObject<AuthSharedLink>[];
  albumName: string;
  slug?: string | null;
  description: string | null;
  albumThumbnailAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
  id: string;
  isActivityEnabled: boolean;
  order: AssetOrder;
  presentation: unknown | null;
  voting: unknown | null;
};

export const mapAlbum = (entity: MaybeDehydrated<MapAlbumDto>): AlbumResponseDto => {
  const albumUsers: AlbumUserResponseDto[] = [];

  if (entity.albumUsers) {
    for (const albumUser of entity.albumUsers) {
      const user = mapUser(albumUser.user);
      albumUsers.push({
        user,
        role: albumUser.role,
      });
    }
  }

  const assets = entity.assets || [];

  const hasSharedLink = !!entity.sharedLinks && entity.sharedLinks.length > 0;
  const hasSharedUser = albumUsers.length > 1;

  let startDate = assets.at(0)?.localDateTime;
  let endDate = assets.at(-1)?.localDateTime;
  // Swap dates if start date is greater than end date.
  if (startDate && endDate && startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  return {
    albumName: entity.albumName,
    slug: entity.slug ?? null,
    // TODO: return null instead of '' in v4
    description: entity.description ?? '',
    albumThumbnailAssetId: entity.albumThumbnailAssetId,
    createdAt: asDateTimeString(entity.createdAt),
    updatedAt: asDateTimeString(entity.updatedAt),
    id: entity.id,
    albumUsers,
    shared: hasSharedUser || hasSharedLink,
    hasSharedLink,
    startDate: asDateTimeString(startDate),
    endDate: asDateTimeString(endDate),
    assetCount: entity.assets?.length || 0,
    isActivityEnabled: entity.isActivityEnabled,
    order: entity.order,
    presentation: (entity.presentation as AlbumPresentation | null) ?? null,
    voting: (entity.voting as AlbumVoting | null) ?? null,
  };
};
