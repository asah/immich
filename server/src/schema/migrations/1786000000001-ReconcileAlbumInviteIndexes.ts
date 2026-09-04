import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // The initial invite migration created equivalent indexes with hand-written names.
  // Aligning the names with the schema makes drift checks accurate without rebuilding data.
  await sql`ALTER INDEX "album_invite_tokenHash_uq" RENAME TO "album_invite_tokenHash_idx";`.execute(db);
  await sql`ALTER INDEX "album_invite_active_album_email_uq" RENAME TO "album_invite_albumId_email_idx";`.execute(db);
  await sql`CREATE INDEX "album_invite_albumId_idx" ON "album_invite" ("albumId");`.execute(db);
  await sql`CREATE INDEX "album_invite_inviterId_idx" ON "album_invite" ("inviterId");`.execute(db);
  await sql.raw(String.raw`
    INSERT INTO "migration_overrides" ("name", "value")
    VALUES ('index_album_invite_albumId_email_idx', '{"type":"index","name":"album_invite_albumId_email_idx","sql":"CREATE UNIQUE INDEX \"album_invite_albumId_email_idx\" ON \"album_invite\" (\"albumId\", \"email\") WHERE (\"acceptedAt\" IS NULL AND \"revokedAt\" IS NULL);"}'::jsonb)
    ON CONFLICT ("name") DO UPDATE SET "value" = EXCLUDED."value";
  `).execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'index_activity_like_idx';`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'index_album_invite_albumId_email_idx';`.execute(db);
  await sql`DROP INDEX "album_invite_inviterId_idx";`.execute(db);
  await sql`DROP INDEX "album_invite_albumId_idx";`.execute(db);
  await sql`ALTER INDEX "album_invite_albumId_email_idx" RENAME TO "album_invite_active_album_email_uq";`.execute(db);
  await sql`ALTER INDEX "album_invite_tokenHash_idx" RENAME TO "album_invite_tokenHash_uq";`.execute(db);
}
