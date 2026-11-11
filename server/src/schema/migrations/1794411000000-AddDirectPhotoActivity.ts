import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "activity" ALTER COLUMN "albumId" DROP NOT NULL;`.execute(db);
  await sql`DROP INDEX IF EXISTS "activity_reaction_idx";`.execute(db);
  await sql`CREATE UNIQUE INDEX "activity_reaction_idx"
    ON "activity" (COALESCE("albumId", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("assetId", '00000000-0000-0000-0000-000000000000'::uuid), "userId", COALESCE("parentActivityId", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "isLiked" = true;`.execute(db);
  await sql`ALTER TABLE "activity" ADD CONSTRAINT "activity_scope_check" CHECK ("albumId" IS NOT NULL OR "assetId" IS NOT NULL);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM "activity" WHERE "albumId" IS NULL;`.execute(db);
  await sql`ALTER TABLE "activity" DROP CONSTRAINT "activity_scope_check";`.execute(db);
  await sql`DROP INDEX IF EXISTS "activity_reaction_idx";`.execute(db);
  await sql`CREATE UNIQUE INDEX "activity_reaction_idx"
    ON "activity" ("albumId", COALESCE("assetId", '00000000-0000-0000-0000-000000000000'::uuid), "userId", COALESCE("parentActivityId", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "isLiked" = true;`.execute(db);
  await sql`ALTER TABLE "activity" ALTER COLUMN "albumId" SET NOT NULL;`.execute(db);
}
