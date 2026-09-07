import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const AlbumVoteParamSchema = z.object({
  id: z.uuidv4().describe('Album ID'),
  assetId: z.uuidv4().describe('Asset ID'),
});

const AlbumVoteSchema = z.object({ value: z.union([z.literal(-1), z.literal(1)]).nullable() }).meta({ id: 'AlbumVoteDto' });

const AlbumVoteCandidateSchema = z
  .object({
    assetId: z.uuidv4(),
    width: z.int().positive().nullable(),
    height: z.int().positive().nullable(),
    value: z.union([z.literal(-1), z.literal(1)]).nullable(),
  })
  .meta({ id: 'AlbumVoteCandidateDto' });

const AlbumVoteSessionSchema = z
  .object({
    candidates: z.array(AlbumVoteCandidateSchema),
    submittedCount: z.int().min(0),
    requiredCount: z.int().min(1),
    sampleSize: z.int().min(1),
    leaderboardVisible: z.boolean(),
  })
  .meta({ id: 'AlbumVoteSessionDto' });

const AlbumVoteLeaderboardItemSchema = z
  .object({ assetId: z.uuidv4(), score: z.int(), positiveVotes: z.int().min(0), ratings: z.int().min(0) })
  .meta({ id: 'AlbumVoteLeaderboardItemDto' });

const AlbumVoteLeaderboardSchema = z
  .object({ voters: z.int().min(0), items: z.array(AlbumVoteLeaderboardItemSchema) })
  .meta({ id: 'AlbumVoteLeaderboardDto' });

export class AlbumVoteParamDto extends createZodDto(AlbumVoteParamSchema) {}
export class AlbumVoteDto extends createZodDto(AlbumVoteSchema) {}
export class AlbumVoteSessionDto extends createZodDto(AlbumVoteSessionSchema) {}
export class AlbumVoteLeaderboardDto extends createZodDto(AlbumVoteLeaderboardSchema) {}
