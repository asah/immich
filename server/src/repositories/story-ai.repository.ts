import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { AiCredentialTestStatus, AiProviderAdapter } from 'src/enum';
import { DB } from 'src/schema';

@Injectable()
export class StoryAiRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getEffectiveProvider(userId: string) {
    return this.db
      .selectFrom('ai_provider')
      .leftJoin('ai_credential', 'ai_credential.id', 'ai_provider.credentialId')
      .selectAll('ai_provider')
      .select([
        'ai_credential.encryptedBytes',
        'ai_credential.nonce',
        'ai_credential.authenticationTag',
        'ai_credential.masterKeyVersion',
        'ai_credential.fingerprint',
      ])
      .where('ai_provider.enabled', '=', true)
      .where((eb) => eb.or([eb('ai_provider.userId', '=', userId), eb('ai_provider.userId', 'is', null)]))
      .orderBy(sql`"ai_provider"."userId" IS NOT NULL`, 'desc')
      .executeTakeFirst();
  }

  async upsertProvider(input: {
    userId: string | null;
    adapter: AiProviderAdapter;
    approvedEndpointId: string;
    model: string;
    enabled: boolean;
    credential?: { encryptedBytes: Buffer; nonce: Buffer; authenticationTag: Buffer; fingerprint: string };
  }) {
    return this.db.transaction().execute(async (tx) => {
      let credentialId: string | null | undefined;
      if (input.credential) {
        const credential = await tx
          .insertInto('ai_credential')
          .values({
            userId: input.userId,
            ...input.credential,
            masterKeyVersion: 1,
            lastTestedAt: null,
            lastTestedStatus: AiCredentialTestStatus.Untested,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        credentialId = credential.id;
      }
      const existing = await tx
        .selectFrom('ai_provider')
        .select(['id', 'credentialId'])
        .where((eb) => (input.userId ? eb('userId', '=', input.userId) : eb('userId', 'is', null)))
        .executeTakeFirst();
      const values = {
        adapter: input.adapter,
        approvedEndpointId: input.approvedEndpointId,
        model: input.model,
        enabled: input.enabled,
        ...(credentialId !== undefined && { credentialId }),
      };
      if (existing) {
        const provider = await tx
          .updateTable('ai_provider')
          .set(values)
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        if (credentialId && existing.credentialId) {
          await tx.deleteFrom('ai_credential').where('id', '=', existing.credentialId).execute();
        }
        return provider;
      }
      return tx
        .insertInto('ai_provider')
        .values({ ...values, userId: input.userId, capabilityFlags: 0, credentialId: credentialId ?? null })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  async deleteProvider(userId: string | null) {
    const provider = await this.db
      .deleteFrom('ai_provider')
      .where((eb) => (userId ? eb('userId', '=', userId) : eb('userId', 'is', null)))
      .returning('credentialId')
      .executeTakeFirst();
    if (provider?.credentialId) {
      await this.db.deleteFrom('ai_credential').where('id', '=', provider.credentialId).execute();
    }
  }

  getConsent(userId: string, providerId: string) {
    return this.db
      .selectFrom('user_ai_consent')
      .selectAll()
      .where('userId', '=', userId)
      .where('providerId', '=', providerId)
      .executeTakeFirst();
  }

  async setConsent(input: {
    userId: string;
    providerId: string;
    textAllowed: boolean;
    thumbnailAllowed: boolean;
    providerDisclosureHash: Buffer;
  }) {
    return this.db
      .insertInto('user_ai_consent')
      .values(input)
      .onConflict((oc) => oc.columns(['userId', 'providerId']).doUpdateSet(input))
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createDraft(input: {
    storyId: string;
    actorId: string;
    baseRevision: number;
    commands: Record<string, unknown>[];
    commandHash: Buffer;
    diff: Record<string, unknown>;
    expiresAt: Date;
  }) {
    return this.db
      .insertInto('story_ai_draft')
      .values({ ...input, commandSchemaVersion: 1, appliedRevisionId: null })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  getDraft(id: string, storyId: string, actorId: string) {
    return this.db
      .selectFrom('story_ai_draft')
      .selectAll()
      .where('id', '=', id)
      .where('storyId', '=', storyId)
      .where('actorId', '=', actorId)
      .executeTakeFirst();
  }

  async markApplied(id: string, revisionId: string) {
    await this.db.updateTable('story_ai_draft').set({ appliedRevisionId: revisionId }).where('id', '=', id).execute();
  }

  async deleteDraft(id: string, storyId: string, actorId: string) {
    await this.db
      .deleteFrom('story_ai_draft')
      .where('id', '=', id)
      .where('storyId', '=', storyId)
      .where('actorId', '=', actorId)
      .execute();
  }
}
