import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE "story_aspect_ratio_enum" AS ENUM ('portrait_4_5','landscape_16_9','square_1_1');`.execute(db);
  await sql`CREATE TYPE "story_revision_source_enum" AS ENUM ('create','manual','import','automatic_draft','ai','undo','redo','restore','migration');`.execute(db);
  await sql`CREATE TYPE "ai_provider_adapter_enum" AS ENUM ('openai');`.execute(db);
  await sql`CREATE TYPE "ai_credential_test_status_enum" AS ENUM ('untested','success','failed');`.execute(db);
  await sql`ALTER TABLE "shared_link" ADD "storyId" uuid;`.execute(db);
  await sql`ALTER TABLE "shared_link" ADD "startPageId" uuid;`.execute(db);
  await sql`ALTER TABLE "shared_link" ADD "startOffsetMs" integer;`.execute(db);
  await sql`CREATE INDEX "shared_link_storyId_idx" ON "shared_link" ("storyId");`.execute(db);
  await sql`CREATE TABLE "story" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "title" character varying(200) NOT NULL DEFAULT 'Untitled Story',
  "description" text NOT NULL DEFAULT '',
  "aspectRatio" story_aspect_ratio_enum NOT NULL,
  "draftRevisionId" uuid NOT NULL,
  "publishedRevisionId" uuid,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "deletedAt" timestamp with time zone,
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  CONSTRAINT "story_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`ALTER TABLE "shared_link" ADD CONSTRAINT "shared_link_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story" ("id") ON UPDATE CASCADE ON DELETE CASCADE;`.execute(db);
  await sql`CREATE INDEX "story_updateId_idx" ON "story" ("updateId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "story_updatedAt"
  BEFORE UPDATE ON "story"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "ai_credential" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "encryptedBytes" bytea NOT NULL, "nonce" bytea NOT NULL, "authenticationTag" bytea NOT NULL, "masterKeyVersion" integer NOT NULL, "fingerprint" character varying(64) NOT NULL, "lastTestedAt" timestamp with time zone, "lastTestedStatus" ai_credential_test_status_enum NOT NULL DEFAULT 'untested', "createdAt" timestamp with time zone NOT NULL DEFAULT now(), "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT "ai_credential_ciphertext_check" CHECK (octet_length("encryptedBytes") > 0), CONSTRAINT "ai_credential_nonce_check" CHECK (octet_length("nonce") >= 12), CONSTRAINT "ai_credential_authenticationTag_check" CHECK (octet_length("authenticationTag") >= 16), CONSTRAINT "ai_credential_masterKeyVersion_check" CHECK ("masterKeyVersion" > 0), CONSTRAINT "ai_credential_fingerprint_check" CHECK (length(fingerprint) > 0), CONSTRAINT "ai_credential_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "ai_credential_userId_idx" ON "ai_credential" ("userId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "ai_credential_updatedAt" BEFORE UPDATE ON "ai_credential" FOR EACH ROW EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "ai_provider" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "adapter" ai_provider_adapter_enum NOT NULL, "approvedEndpointId" character varying(100) NOT NULL, "model" character varying(200) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "capabilityFlags" integer NOT NULL DEFAULT 0, "credentialId" uuid, "createdAt" timestamp with time zone NOT NULL DEFAULT now(), "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT "ai_provider_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ai_credential" ("id") ON UPDATE CASCADE ON DELETE SET NULL, CONSTRAINT "ai_provider_approvedEndpointId_check" CHECK (length("approvedEndpointId") > 0), CONSTRAINT "ai_provider_model_check" CHECK (length(model) > 0), CONSTRAINT "ai_provider_capabilityFlags_check" CHECK ("capabilityFlags" >= 0), CONSTRAINT "ai_provider_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "ai_provider_userId_idx" ON "ai_provider" ("userId");`.execute(db);
  await sql`CREATE INDEX "ai_provider_credentialId_idx" ON "ai_provider" ("credentialId");`.execute(db);
  await sql`CREATE UNIQUE INDEX "ai_provider_enabled_server_uq" ON "ai_provider" ("enabled") WHERE "userId" IS NULL AND enabled;`.execute(db);
  await sql`CREATE UNIQUE INDEX "ai_provider_enabled_user_uq" ON "ai_provider" ("userId") WHERE "userId" IS NOT NULL AND enabled;`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "ai_provider_updatedAt" BEFORE UPDATE ON "ai_provider" FOR EACH ROW EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "user_ai_consent" (
  "userId" uuid NOT NULL, "providerId" uuid NOT NULL, "textAllowed" boolean NOT NULL DEFAULT false, "thumbnailAllowed" boolean NOT NULL DEFAULT false, "providerDisclosureHash" bytea NOT NULL, "createdAt" timestamp with time zone NOT NULL DEFAULT now(), "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_ai_consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT "user_ai_consent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_provider" ("id") ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT "user_ai_consent_disclosureHash_check" CHECK (octet_length("providerDisclosureHash") = 32), CONSTRAINT "user_ai_consent_pkey" PRIMARY KEY ("userId", "providerId")
);`.execute(db);
  await sql`CREATE INDEX "user_ai_consent_userId_idx" ON "user_ai_consent" ("userId");`.execute(db);
  await sql`CREATE INDEX "user_ai_consent_providerId_idx" ON "user_ai_consent" ("providerId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "user_ai_consent_updatedAt" BEFORE UPDATE ON "user_ai_consent" FOR EACH ROW EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "story_asset" (
  "storyId" uuid NOT NULL,
  "assetId" uuid NOT NULL,
  "roleMask" integer NOT NULL,
  "sourceAlbumId" uuid,
  "addedById" uuid,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "story_asset_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_asset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_asset_sourceAlbumId_fkey" FOREIGN KEY ("sourceAlbumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "story_asset_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "story_asset_pkey" PRIMARY KEY ("storyId", "assetId")
);`.execute(db);
  await sql`CREATE INDEX "story_asset_storyId_idx" ON "story_asset" ("storyId");`.execute(db);
  await sql`CREATE INDEX "story_asset_assetId_idx" ON "story_asset" ("assetId");`.execute(db);
  await sql`CREATE INDEX "story_asset_sourceAlbumId_idx" ON "story_asset" ("sourceAlbumId");`.execute(db);
  await sql`CREATE INDEX "story_asset_addedById_idx" ON "story_asset" ("addedById");`.execute(db);
  await sql`CREATE TABLE "story_revision" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "storyId" uuid NOT NULL,
  "revision" bigint NOT NULL,
  "schemaVersion" integer NOT NULL,
  "document" jsonb NOT NULL,
  "contentHash" bytea NOT NULL,
  "actorId" uuid,
  "source" story_revision_source_enum NOT NULL,
  "summary" character varying(500) NOT NULL,
  "name" character varying(100),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "story_revision_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_revision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "story_revision_storyId_id_uq" UNIQUE ("storyId", "id"),
  CONSTRAINT "story_revision_storyId_revision_uq" UNIQUE ("storyId", "revision"),
  CONSTRAINT "story_revision_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "story_revision_storyId_idx" ON "story_revision" ("storyId");`.execute(db);
  await sql`CREATE INDEX "story_revision_actorId_idx" ON "story_revision" ("actorId");`.execute(db);
  await sql`ALTER TABLE "story" ADD CONSTRAINT "story_draftRevision_fkey" FOREIGN KEY ("id", "draftRevisionId") REFERENCES "story_revision" ("storyId", "id") DEFERRABLE INITIALLY DEFERRED;`.execute(db);
  await sql`ALTER TABLE "story" ADD CONSTRAINT "story_publishedRevision_fkey" FOREIGN KEY ("id", "publishedRevisionId") REFERENCES "story_revision" ("storyId", "id") DEFERRABLE INITIALLY DEFERRED;`.execute(db);
  await sql`CREATE TABLE "story_mutation" (
  "storyId" uuid NOT NULL,
  "clientMutationId" uuid NOT NULL,
  "sessionId" uuid NOT NULL,
  "clientSequence" bigint NOT NULL,
  "baseRevision" bigint NOT NULL,
  "resultRevisionId" uuid NOT NULL,
  "requestHash" bytea NOT NULL,
  "response" jsonb NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "story_mutation_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_mutation_resultRevisionId_fkey" FOREIGN KEY ("resultRevisionId") REFERENCES "story_revision" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_mutation_storyId_sessionId_clientSequence_uq" UNIQUE ("storyId", "sessionId", "clientSequence"),
  CONSTRAINT "story_mutation_storyId_clientMutationId_uq" UNIQUE ("storyId", "clientMutationId"),
  CONSTRAINT "story_mutation_clientSequence_check" CHECK ("clientSequence" >= 0)
);`.execute(db);
  await sql`CREATE INDEX "story_mutation_storyId_idx" ON "story_mutation" ("storyId");`.execute(db);
  await sql`CREATE INDEX "story_mutation_resultRevisionId_idx" ON "story_mutation" ("resultRevisionId");`.execute(db);
  await sql`CREATE TABLE "story_published_asset" (
  "storyId" uuid NOT NULL,
  "assetId" uuid NOT NULL,
  "revisionId" uuid NOT NULL,
  CONSTRAINT "story_published_asset_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_published_asset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_published_asset_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "story_revision" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_published_asset_pkey" PRIMARY KEY ("storyId", "assetId")
);`.execute(db);
  await sql`CREATE INDEX "story_published_asset_storyId_idx" ON "story_published_asset" ("storyId");`.execute(db);
  await sql`CREATE INDEX "story_published_asset_assetId_idx" ON "story_published_asset" ("assetId");`.execute(db);
  await sql`CREATE INDEX "story_published_asset_revisionId_idx" ON "story_published_asset" ("revisionId");`.execute(db);
  await sql`CREATE TABLE "story_user" (
  "storyId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "role" album_user_role_enum NOT NULL DEFAULT 'editor',
  "createId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "story_user_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_user_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "story_user_pkey" PRIMARY KEY ("storyId", "userId")
);`.execute(db);
  await sql`CREATE UNIQUE INDEX "story_user_unique_owner" ON "story_user" ("storyId") WHERE (role = 'owner');`.execute(db);
  await sql`CREATE INDEX "story_user_storyId_idx" ON "story_user" ("storyId");`.execute(db);
  await sql`CREATE INDEX "story_user_userId_idx" ON "story_user" ("userId");`.execute(db);
  await sql`CREATE INDEX "story_user_createId_idx" ON "story_user" ("createId");`.execute(db);
  await sql`CREATE INDEX "story_user_updateId_idx" ON "story_user" ("updateId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "story_user_updatedAt"
  BEFORE UPDATE ON "story_user"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "story_ai_draft" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "storyId" uuid NOT NULL, "actorId" uuid NOT NULL, "baseRevision" bigint NOT NULL, "commandSchemaVersion" integer NOT NULL, "commands" jsonb NOT NULL, "commandHash" bytea NOT NULL, "diff" jsonb NOT NULL, "expiresAt" timestamp with time zone NOT NULL, "createdAt" timestamp with time zone NOT NULL DEFAULT now(), "appliedRevisionId" uuid,
  CONSTRAINT "story_ai_draft_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "story" ("id") ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT "story_ai_draft_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT "story_ai_draft_appliedRevisionId_fkey" FOREIGN KEY ("appliedRevisionId") REFERENCES "story_revision" ("id") ON UPDATE CASCADE ON DELETE SET NULL, CONSTRAINT "story_ai_draft_baseRevision_check" CHECK ("baseRevision" >= 0), CONSTRAINT "story_ai_draft_commandSchemaVersion_check" CHECK ("commandSchemaVersion" > 0), CONSTRAINT "story_ai_draft_commandHash_check" CHECK (octet_length("commandHash") = 32), CONSTRAINT "story_ai_draft_expiry_check" CHECK ("expiresAt" > "createdAt"), CONSTRAINT "story_ai_draft_commands_check" CHECK (jsonb_typeof(commands) = 'array'), CONSTRAINT "story_ai_draft_diff_check" CHECK (jsonb_typeof(diff) = 'object'), CONSTRAINT "story_ai_draft_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "story_ai_draft_storyId_idx" ON "story_ai_draft" ("storyId");`.execute(db);
  await sql`CREATE INDEX "story_ai_draft_actorId_idx" ON "story_ai_draft" ("actorId");`.execute(db);
  await sql`CREATE INDEX "story_ai_draft_appliedRevisionId_idx" ON "story_ai_draft" ("appliedRevisionId");`.execute(db);
  await sql`ALTER TABLE "shared_link" ADD CONSTRAINT "shared_link_startOffsetMs_check" CHECK ("startOffsetMs" IS NULL OR "startOffsetMs" >= 0);`.execute(db);
  await sql`ALTER TABLE "shared_link" ADD CONSTRAINT "shared_link_story_target_check" CHECK (type <> 'STORY' OR ("storyId" IS NOT NULL AND "albumId" IS NULL AND "allowUpload" = false AND "showExif" = false));`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_story_updatedAt', '{"type":"trigger","name":"story_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"story_updatedAt\\"\\n  BEFORE UPDATE ON \\"story\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_story_user_updatedAt', '{"type":"trigger","name":"story_user_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"story_user_updatedAt\\"\\n  BEFORE UPDATE ON \\"story_user\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('index_story_user_unique_owner', '{"type":"index","name":"story_user_unique_owner","sql":"CREATE UNIQUE INDEX \\"story_user_unique_owner\\" ON \\"story_user\\" (\\"storyId\\") WHERE (role = ''owner'');"}'::jsonb);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "shared_link" DROP CONSTRAINT "shared_link_startOffsetMs_check";`.execute(db);
  await sql`ALTER TABLE "shared_link" DROP CONSTRAINT "shared_link_story_target_check";`.execute(db);
  await sql`ALTER TABLE "shared_link" DROP CONSTRAINT "shared_link_storyId_fkey";`.execute(db);
  await sql`ALTER TABLE "story" DROP CONSTRAINT "story_draftRevision_fkey";`.execute(db);
  await sql`ALTER TABLE "story" DROP CONSTRAINT "story_publishedRevision_fkey";`.execute(db);
  await sql`DROP TABLE "story_ai_draft";`.execute(db);
  await sql`DROP TABLE "user_ai_consent";`.execute(db);
  await sql`DROP TABLE "ai_provider";`.execute(db);
  await sql`DROP TABLE "ai_credential";`.execute(db);
  await sql`DROP TABLE "story_asset";`.execute(db);
  await sql`DROP TABLE "story_mutation";`.execute(db);
  await sql`DROP TABLE "story_published_asset";`.execute(db);
  await sql`DROP TABLE "story_revision";`.execute(db);
  await sql`DROP TABLE "story_user";`.execute(db);
  await sql`DROP TABLE "story";`.execute(db);
  await sql`DROP TYPE "story_aspect_ratio_enum";`.execute(db);
  await sql`DROP TYPE "story_revision_source_enum";`.execute(db);
  await sql`DROP TYPE "ai_provider_adapter_enum";`.execute(db);
  await sql`DROP TYPE "ai_credential_test_status_enum";`.execute(db);
  await sql`DROP INDEX "shared_link_storyId_idx";`.execute(db);
  await sql`ALTER TABLE "shared_link" DROP COLUMN "storyId";`.execute(db);
  await sql`ALTER TABLE "shared_link" DROP COLUMN "startPageId";`.execute(db);
  await sql`ALTER TABLE "shared_link" DROP COLUMN "startOffsetMs";`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_story_updatedAt';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_story_user_updatedAt';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'index_story_user_unique_owner';`.execute(db);
}
