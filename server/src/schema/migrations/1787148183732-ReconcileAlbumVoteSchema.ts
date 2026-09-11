import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "album_vote" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();`.execute(db);
  await sql`ALTER TABLE "album_vote" DROP CONSTRAINT IF EXISTS "album_vote_check";`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS "album_vote_albumId_idx" ON "album_vote" ("albumId");`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS "album_vote_assetId_idx" ON "album_vote" ("assetId");`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS "album_vote_userId_idx" ON "album_vote" ("userId");`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS "album_vote_sharedLinkId_idx" ON "album_vote" ("sharedLinkId");`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_album_vote_updatedAt', '{"type":"trigger","name":"album_vote_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"album_vote_updatedAt\\"\\n  BEFORE UPDATE ON \\"album_vote\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb) ON CONFLICT ("name") DO UPDATE SET "value" = EXCLUDED."value";`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS "album_vote_albumId_idx";`.execute(db);
  await sql`DROP INDEX IF EXISTS "album_vote_assetId_idx";`.execute(db);
  await sql`DROP INDEX IF EXISTS "album_vote_userId_idx";`.execute(db);
  await sql`DROP INDEX IF EXISTS "album_vote_sharedLinkId_idx";`.execute(db);
  await sql`ALTER TABLE "album_vote" ADD CONSTRAINT "album_vote_check" CHECK (("userId" IS NOT NULL) <> ("anonymousVoterHash" IS NOT NULL));`.execute(db);
  await sql`ALTER TABLE "album_vote" ALTER COLUMN "id" SET DEFAULT immich_uuid_v7();`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_album_vote_updatedAt';`.execute(db);
}
