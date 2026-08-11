import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE INDEX IF NOT EXISTS "activity_parentActivityId_idx" ON "activity" ("parentActivityId");`.execute(db);
  await sql`ALTER TABLE "activity_asset" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4(), ALTER COLUMN "createdAt" SET DEFAULT now();`.execute(db);
  await sql`ALTER TABLE "activity_asset" DROP CONSTRAINT IF EXISTS "activity_asset_unique";`.execute(db);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "activity_asset_unique" ON "activity_asset" ("activityId", "assetId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS "activity_asset_unique";`.execute(db);
  await sql`ALTER TABLE "activity_asset" ADD CONSTRAINT "activity_asset_unique" UNIQUE ("activityId", "assetId");`.execute(db);
  await sql`DROP INDEX IF EXISTS "activity_parentActivityId_idx";`.execute(db);
}
