import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { AuthDto } from 'src/dtos/auth.dto';
import { AlbumVoting } from 'src/dtos/album.dto';
import { AlbumVoteDto } from 'src/dtos/album-vote.dto';
import { DB } from 'src/schema';

const DEFAULT_VOTING: AlbumVoting = {
  enabled: false,
  sampleSize: 20,
  allowAnonymous: true,
  leaderboardVisible: true,
  downvotesAffectRanking: false,
};

const positiveReactionKeys = new Set(['like', 'heart', 'love', 'laugh', 'celebrate', 'party', 'smile', 'clap']);
const negativeReactionKeys = new Set(['dislike', 'poop']);

type Voter = { userId: string; sharedLinkId: null; hash: null; key: string } | { userId: null; sharedLinkId: string; hash: Buffer; key: string };

@Injectable()
export class AlbumVoteService {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  private async getVoting(auth: AuthDto, albumId: string, anonymousToken?: string): Promise<{ voting: AlbumVoting; voter: Voter }> {
    const album = await this.db.selectFrom('album').select('voting').where('id', '=', albumId).where('deletedAt', 'is', null).executeTakeFirst();
    if (!album) throw new BadRequestException('Album not found');
    const voting = { ...DEFAULT_VOTING, ...(album.voting as Partial<AlbumVoting> | null) };
    if (!voting.enabled) throw new ForbiddenException('Voting is not enabled for this album');

    if (auth.sharedLink) {
      if (auth.sharedLink.albumId !== albumId || !voting.allowAnonymous) throw new ForbiddenException('Voting is not available on this shared link');
      if (!anonymousToken) throw new BadRequestException('Missing anonymous voting token');
      return {
        voting,
        voter: {
          userId: null,
          sharedLinkId: auth.sharedLink.id,
          hash: createHash('sha256').update(anonymousToken).digest(),
          key: `shared:${auth.sharedLink.id}:${anonymousToken}`,
        },
      };
    }

    const membership = await this.db
      .selectFrom('album_user')
      .select('userId')
      .where('albumId', '=', albumId)
      .where('userId', '=', auth.user.id)
      .executeTakeFirst();
    if (!membership) throw new ForbiddenException('Album access required');
    return { voting, voter: { userId: auth.user.id, sharedLinkId: null, hash: null, key: `user:${auth.user.id}` } };
  }

  async getSession(auth: AuthDto, albumId: string, anonymousToken?: string) {
    const { voting, voter } = await this.getVoting(auth, albumId, anonymousToken);
    const votes = await this.db
      .selectFrom('album_vote')
      .select(['assetId', 'value'])
      .where('albumId', '=', albumId)
      .$if(voter.userId !== null, (qb) => qb.where('userId', '=', voter.userId!))
      .$if(voter.userId === null, (qb) => qb.where('sharedLinkId', '=', voter.sharedLinkId!).where('anonymousVoterHash', '=', voter.hash!))
      .execute();
    const voteByAsset = new Map(votes.map((vote) => [vote.assetId, vote.value as -1 | 1]));
    const candidates = await this.db
      .selectFrom('album_asset')
      .innerJoin('asset', 'asset.id', 'album_asset.assetId')
      .select(['asset.id as assetId', 'asset.width', 'asset.height'])
      .where('album_asset.albumId', '=', albumId)
      .where('asset.deletedAt', 'is', null)
      .orderBy(sql<string>`md5(${voter.key} || "asset"."id"::text)`)
      .limit(voting.sampleSize)
      .execute();
    return {
      candidates: candidates.map(({ assetId, width, height }) => ({
        assetId,
        width,
        height,
        value: voteByAsset.get(assetId) ?? null,
      })),
      submittedCount: votes.length,
      requiredCount: 10,
      sampleSize: voting.sampleSize,
      leaderboardVisible: voting.leaderboardVisible,
    };
  }

  async cast(auth: AuthDto, albumId: string, assetId: string, dto: AlbumVoteDto, anonymousToken?: string) {
    const { voter } = await this.getVoting(auth, albumId, anonymousToken);
    const asset = await this.db.selectFrom('album_asset').select('assetId').where('albumId', '=', albumId).where('assetId', '=', assetId).executeTakeFirst();
    if (!asset) throw new BadRequestException('Asset is not in this album');
    await this.db.transaction().execute(async (trx) => {
      let query = trx.deleteFrom('album_vote').where('albumId', '=', albumId).where('assetId', '=', assetId);
      query = voter.userId ? query.where('userId', '=', voter.userId) : query.where('sharedLinkId', '=', voter.sharedLinkId!).where('anonymousVoterHash', '=', voter.hash!);
      await query.execute();
      if (dto.value !== null) await trx.insertInto('album_vote').values({ albumId, assetId, userId: voter.userId, sharedLinkId: voter.sharedLinkId, anonymousVoterHash: voter.hash, value: dto.value }).execute();
    });
  }

  async getLeaderboard(auth: AuthDto, albumId: string, anonymousToken?: string) {
    const { voting } = await this.getVoting(auth, albumId, anonymousToken);
    if (!voting.leaderboardVisible) throw new ForbiddenException('Leaderboard is not visible');
    const score = voting.downvotesAffectRanking ? sql<number>`sum("value")` : sql<number>`sum(case when "value" = 1 then 1 else 0 end)`;
    const [rows, reactionRows, voters] = await Promise.all([
      this.db.selectFrom('album_vote').select(['assetId', score.as('score'), sql<number>`sum(case when "value" = 1 then 1 else 0 end)`.as('positiveVotes'), sql<number>`count(*)`.as('ratings')]).where('albumId', '=', albumId).groupBy('assetId').orderBy('score', 'desc').orderBy('positiveVotes', 'desc').orderBy('assetId', 'asc').limit(50).execute(),
      this.db
        .selectFrom('activity')
        .leftJoin('album_vote as explicit_vote', (join) =>
          join
            .onRef('explicit_vote.albumId', '=', 'activity.albumId')
            .onRef('explicit_vote.assetId', '=', 'activity.assetId')
            .onRef('explicit_vote.userId', '=', 'activity.userId'),
        )
        .select(['activity.assetId', 'activity.reactionKey'])
        .where('activity.albumId', '=', albumId)
        .where('activity.isLiked', '=', true)
        .where('activity.parentActivityId', 'is', null)
        .where('activity.assetId', 'is not', null)
        .where('explicit_vote.id', 'is', null)
        .where('activity.reactionKey', 'in', [...positiveReactionKeys, ...negativeReactionKeys])
        .execute(),
      this.db.selectFrom('album_vote').select(sql<number>`count(distinct coalesce("userId"::text, encode("anonymousVoterHash", 'hex')))`.as('count')).where('albumId', '=', albumId).executeTakeFirstOrThrow(),
    ]);
    const items = new Map(rows.map((row) => [row.assetId, { assetId: row.assetId, score: Number(row.score), positiveVotes: Number(row.positiveVotes), ratings: Number(row.ratings) }]));
    for (const reaction of reactionRows) {
      if (!reaction.assetId || !reaction.reactionKey) continue;
      const item = items.get(reaction.assetId) ?? { assetId: reaction.assetId, score: 0, positiveVotes: 0, ratings: 0 };
      const value = positiveReactionKeys.has(reaction.reactionKey) ? 1 : -1;
      item.score += value === -1 && !voting.downvotesAffectRanking ? 0 : value;
      item.positiveVotes += value === 1 ? 1 : 0;
      item.ratings++;
      items.set(reaction.assetId, item);
    }
    return { voters: Number(voters.count), items: [...items.values()].sort((left, right) => right.score - left.score || right.positiveVotes - left.positiveVotes || left.assetId.localeCompare(right.assetId)).slice(0, 50) };
  }
}
