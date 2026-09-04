import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Build the canonical unique index first, so active invitations remain protected
  // while the equivalent, older predicate form is replaced.
  await sql`CREATE UNIQUE INDEX "album_invite_albumId_email_reconciled_idx"
    ON "album_invite" ("albumId", "email")
    WHERE ("acceptedAt" IS NULL AND "revokedAt" IS NULL);`.execute(db);
  await sql`DROP INDEX "album_invite_albumId_email_idx";`.execute(db);
  await sql`ALTER INDEX "album_invite_albumId_email_reconciled_idx" RENAME TO "album_invite_albumId_email_idx";`.execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Keep the canonical index on rollback; reverting it would reintroduce schema drift.
}
