import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE "album_asset" ADD COLUMN "priority" smallint`.execute(db);
  await sql`ALTER TABLE "album_asset" ADD CONSTRAINT "album_asset_priority_check" CHECK ("priority" BETWEEN 1 AND 9)`.execute(db);
  await sql`CREATE INDEX "album_asset_albumId_priority_idx" ON "album_asset" ("albumId", "priority", "assetId")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX "album_asset_albumId_priority_idx"`.execute(db);
  await sql`ALTER TABLE "album_asset" DROP CONSTRAINT "album_asset_priority_check"`.execute(db);
  await sql`ALTER TABLE "album_asset" DROP COLUMN "priority"`.execute(db);
}
