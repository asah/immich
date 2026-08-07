import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "album_asset" DROP CONSTRAINT IF EXISTS "album_asset_priority_check"`.execute(db);
  await sql`DROP INDEX IF EXISTS "album_asset_albumId_priority_idx"`.execute(db);
  await sql`ALTER TABLE "album_asset" DROP COLUMN IF EXISTS "priority"`.execute(db);
}

export async function down(): Promise<void> {
  // Album priority was replaced by shared tags and is intentionally not restored.
}
