import { ConflictException, Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { createHash, randomUUID } from 'node:crypto';
import { StoryDocument } from 'src/dtos/story.dto';
import { AlbumUserRole, StoryRevisionSource } from 'src/enum';
import { DB } from 'src/schema';
import { StoryMutationTable } from 'src/schema/tables/story-mutation.table';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest();
export type StoryCommandResult = { revisionId: string; revision: number; document: StoryDocument };

@Injectable()
export class StoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async create(input: {
    title: string;
    description: string;
    aspectRatio: DB['story']['aspectRatio'];
    ownerId: string;
    document: StoryDocument;
  }) {
    return this.db.transaction().execute(async (tx) => {
      const storyId = randomUUID();
      const revisionId = randomUUID();
      const story = await tx
        .insertInto('story')
        .values({
          id: storyId,
          title: input.title,
          description: input.description,
          aspectRatio: input.aspectRatio,
          draftRevisionId: revisionId,
          publishedRevisionId: null,
          deletedAt: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('story_user')
        .values({ storyId: story.id, userId: input.ownerId, role: AlbumUserRole.Owner })
        .execute();
      const revision = await tx
        .insertInto('story_revision')
        .values({
          id: revisionId,
          storyId: story.id,
          revision: 0,
          schemaVersion: 1,
          document: input.document,
          contentHash: hash(input.document),
          actorId: input.ownerId,
          source: StoryRevisionSource.Create,
          summary: 'Created story',
          name: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ...story, role: AlbumUserRole.Owner, draftRevision: revision.revision };
    });
  }

  getAll(userId: string) {
    return this.base(userId).orderBy('story.updatedAt', 'desc').execute();
  }

  get(id: string, userId: string) {
    return this.base(userId).where('story.id', '=', id).executeTakeFirst();
  }

  getDocument(id: string) {
    return this.db
      .selectFrom('story')
      .innerJoin('story_revision', 'story_revision.id', 'story.draftRevisionId')
      .select(['story_revision.id as revisionId', 'story_revision.revision', 'story_revision.document'])
      .where('story.id', '=', id)
      .executeTakeFirst();
  }

  getMutation(storyId: string, clientMutationId: string, sessionId: string, clientSequence: number) {
    return this.db
      .selectFrom('story_mutation')
      .selectAll()
      .where('storyId', '=', storyId)
      .where((eb) =>
        eb.or([
          eb('clientMutationId', '=', clientMutationId),
          eb.and([eb('sessionId', '=', sessionId), eb('clientSequence', '=', clientSequence)]),
        ]),
      )
      .executeTakeFirst();
  }

  async update(id: string, values: { title?: string; description?: string }) {
    await this.db.updateTable('story').set(values).where('id', '=', id).execute();
  }

  async remove(id: string) {
    await this.db.updateTable('story').set({ deletedAt: new Date() }).where('id', '=', id).execute();
  }

  listRevisions(storyId: string, options: { before?: number; limit: number }) {
    return this.db
      .selectFrom('story_revision')
      .selectAll()
      .where('storyId', '=', storyId)
      .$if(options.before !== undefined, (query) => query.where('revision', '<', options.before!))
      .orderBy('revision', 'desc')
      .limit(options.limit)
      .execute();
  }

  async restoreDeleted(storyId: string, ownerId: string) {
    return this.db
      .updateTable('story')
      .set({ deletedAt: null })
      .where('id', '=', storyId)
      .where('deletedAt', 'is not', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('story_user')
            .select('story_user.userId')
            .whereRef('story_user.storyId', '=', 'story.id')
            .where('story_user.userId', '=', ownerId)
            .where('story_user.role', '=', AlbumUserRole.Owner),
        ),
      )
      .returning('id')
      .executeTakeFirst();
  }

  getRevision(storyId: string, revisionId: string) {
    return this.db
      .selectFrom('story_revision')
      .selectAll()
      .where('storyId', '=', storyId)
      .where('id', '=', revisionId)
      .executeTakeFirst();
  }

  async nameRevision(storyId: string, revisionId: string, name: string | null) {
    return this.db
      .updateTable('story_revision')
      .set({ name })
      .where('storyId', '=', storyId)
      .where('id', '=', revisionId)
      .returningAll()
      .executeTakeFirst();
  }

  getUsers(storyId: string) {
    return this.db.selectFrom('story_user').select(['userId', 'role']).where('storyId', '=', storyId).execute();
  }

  async addUser(storyId: string, userId: string, role: AlbumUserRole) {
    await this.db
      .insertInto('story_user')
      .values({ storyId, userId, role })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  async updateUser(storyId: string, userId: string, role: AlbumUserRole) {
    await this.db
      .updateTable('story_user')
      .set({ role })
      .where('storyId', '=', storyId)
      .where('userId', '=', userId)
      .execute();
  }

  async removeUser(storyId: string, userId: string) {
    await this.db.deleteFrom('story_user').where('storyId', '=', storyId).where('userId', '=', userId).execute();
  }

  async commit(input: {
    storyId: string;
    actorId: string;
    baseRevision: number;
    document: StoryDocument;
    source: StoryRevisionSource;
    summary: string;
    mutation?: Pick<
      Insertable<StoryMutationTable>,
      'clientMutationId' | 'sessionId' | 'clientSequence' | 'requestHash'
    >;
  }): Promise<StoryCommandResult> {
    return this.db.transaction().execute(async (tx) => {
      if (input.mutation) {
        const replay = await tx
          .selectFrom('story_mutation')
          .selectAll()
          .where('storyId', '=', input.storyId)
          .where('clientMutationId', '=', input.mutation.clientMutationId)
          .executeTakeFirst();
        if (replay) {
          if (!replay.requestHash.equals(input.mutation.requestHash)) {
            throw new ConflictException('Mutation ID has already been used');
          }
          return replay.response as StoryCommandResult;
        }
      }

      const head = await tx
        .selectFrom('story')
        .innerJoin('story_revision', 'story_revision.id', 'story.draftRevisionId')
        .select(['story.draftRevisionId', 'story_revision.revision'])
        .where('story.id', '=', input.storyId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (Number(head.revision) !== input.baseRevision) {
        throw new ConflictException({ code: 'STALE_REVISION', currentRevision: Number(head.revision) });
      }

      const revision = await tx
        .insertInto('story_revision')
        .values({
          storyId: input.storyId,
          revision: input.baseRevision + 1,
          schemaVersion: 1,
          document: input.document,
          contentHash: hash(input.document),
          actorId: input.actorId,
          source: input.source,
          summary: input.summary,
          name: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx.updateTable('story').set({ draftRevisionId: revision.id }).where('id', '=', input.storyId).execute();
      await this.replaceAssetIndex(tx, input.storyId, input.actorId, input.document);

      const response = { revisionId: revision.id, revision: Number(revision.revision), document: input.document };
      if (input.mutation) {
        await tx
          .insertInto('story_mutation')
          .values({
            storyId: input.storyId,
            ...input.mutation,
            baseRevision: input.baseRevision,
            resultRevisionId: revision.id,
            response,
          })
          .execute();
      }
      return response;
    });
  }

  async publish(storyId: string) {
    return this.db.transaction().execute(async (tx) => {
      const story = await tx
        .selectFrom('story')
        .selectAll()
        .where('id', '=', storyId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const document = await tx
        .selectFrom('story_revision')
        .select('document')
        .where('id', '=', story.draftRevisionId!)
        .executeTakeFirstOrThrow();
      await tx.deleteFrom('story_published_asset').where('storyId', '=', storyId).execute();
      const assetIds = this.assetIds(document.document as StoryDocument);
      if (assetIds.length > 0) {
        await tx
          .insertInto('story_published_asset')
          .values(assetIds.map((assetId) => ({ storyId, assetId, revisionId: story.draftRevisionId! })))
          .execute();
      }
      await tx
        .updateTable('story')
        .set({ publishedRevisionId: story.draftRevisionId })
        .where('id', '=', storyId)
        .execute();
    });
  }

  async unpublish(storyId: string) {
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('story_published_asset').where('storyId', '=', storyId).execute();
      await tx.updateTable('story').set({ publishedRevisionId: null }).where('id', '=', storyId).execute();
    });
  }

  async hasPublishedAsset(storyId: string, assetId: string) {
    const row = await this.db
      .selectFrom('story_published_asset')
      .innerJoin('story', (join) =>
        join
          .onRef('story.id', '=', 'story_published_asset.storyId')
          .onRef('story.publishedRevisionId', '=', 'story_published_asset.revisionId'),
      )
      .innerJoin('asset', (join) =>
        join.onRef('asset.id', '=', 'story_published_asset.assetId').on('asset.deletedAt', 'is', null),
      )
      .select('story_published_asset.assetId')
      .where('story.id', '=', storyId)
      .where('story.deletedAt', 'is', null)
      .where('story_published_asset.assetId', '=', assetId)
      .executeTakeFirst();
    return !!row;
  }

  getPublished(storyId: string) {
    return this.db
      .selectFrom('story')
      .innerJoin('story_revision', 'story_revision.id', 'story.publishedRevisionId')
      .select([
        'story.id',
        'story.title',
        'story.description',
        'story.aspectRatio',
        'story.publishedRevisionId as revisionId',
        'story_revision.document',
      ])
      .where('story.id', '=', storyId)
      .where('story.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  private base(userId: string) {
    return this.db
      .selectFrom('story')
      .innerJoin('story_user', (join) =>
        join.onRef('story_user.storyId', '=', 'story.id').on('story_user.userId', '=', userId),
      )
      .innerJoin('story_revision', 'story_revision.id', 'story.draftRevisionId')
      .selectAll('story')
      .select(['story_user.role', 'story_revision.revision as draftRevision'])
      .where('story.deletedAt', 'is', null);
  }

  private async replaceAssetIndex(tx: Kysely<DB>, storyId: string, actorId: string, document: StoryDocument) {
    await tx.deleteFrom('story_asset').where('storyId', '=', storyId).execute();
    const assetIds = this.assetIds(document);
    if (assetIds.length > 0) {
      await tx
        .insertInto('story_asset')
        .values(assetIds.map((assetId) => ({ storyId, assetId, roleMask: 1, sourceAlbumId: null, addedById: actorId })))
        .execute();
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
    return [...ids];
  }
}
