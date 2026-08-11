import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "activity"
    ADD COLUMN "commentDocument" jsonb,
    ADD COLUMN "reactionKey" character varying,
    ADD COLUMN "parentActivityId" uuid;`.execute(db);

  await sql`UPDATE "activity" SET "reactionKey" = 'like' WHERE "isLiked" = true;`.execute(db);
  await sql`ALTER TABLE "activity" DROP CONSTRAINT "activity_like_check";`.execute(db);
  await sql`DROP INDEX IF EXISTS "activity_like_idx";`.execute(db);
  await sql`CREATE UNIQUE INDEX "activity_reaction_idx"
    ON "activity" ("albumId", COALESCE("assetId", '00000000-0000-0000-0000-000000000000'::uuid), "userId", COALESCE("parentActivityId", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "isLiked" = true;`.execute(db);

  await sql`CREATE TABLE "activity_asset" (
    "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
    "activityId" uuid NOT NULL,
    "assetId" uuid NOT NULL,
    "position" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "activity_asset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_asset_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "activity_asset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "activity_asset_unique" UNIQUE ("activityId", "assetId")
  );`.execute(db);
  await sql`CREATE INDEX "activity_asset_activityId_idx" ON "activity_asset" ("activityId");`.execute(db);
  await sql`CREATE INDEX "activity_asset_assetId_idx" ON "activity_asset" ("assetId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "activity_asset";`.execute(db);
  await sql`DROP INDEX IF EXISTS "activity_reaction_idx";`.execute(db);
  await sql`CREATE UNIQUE INDEX "activity_like_idx"
    ON "activity" ("assetId", "userId", "albumId") WHERE ("isLiked" = true);`.execute(db);
  await sql`ALTER TABLE "activity"
    ADD CONSTRAINT "activity_like_check"
    CHECK (("comment" IS NULL AND "isLiked" = true) OR ("comment" IS NOT NULL AND "isLiked" = false));`.execute(db);
  await sql`ALTER TABLE "activity"
    DROP COLUMN "commentDocument",
    DROP COLUMN "reactionKey",
    DROP COLUMN "parentActivityId";`.execute(db);
}
