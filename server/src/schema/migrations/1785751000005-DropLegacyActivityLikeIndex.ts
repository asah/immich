import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS "index_activity_like_idx";`.execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // The legacy index is intentionally not restored; reaction uniqueness is now handled by activity_reaction_idx.
}
