import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "album" ADD "slug" character varying;`.execute(db);
  await sql`ALTER TABLE "album" ADD CONSTRAINT "album_slug_uq" UNIQUE ("slug");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "album" DROP CONSTRAINT "album_slug_uq";`.execute(db);
  await sql`ALTER TABLE "album" DROP COLUMN "slug";`.execute(db);
}
