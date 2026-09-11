import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "tag" ADD COLUMN IF NOT EXISTS "description" character varying;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "tag" DROP COLUMN IF EXISTS "description";`.execute(db);
}
