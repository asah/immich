import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // `value` is JSONB, so use a JSON object rather than a JSON-encoded string.
  await sql.raw(String.raw`
    UPDATE "migration_overrides"
    SET "value" = '{"type":"index","name":"album_invite_albumId_email_idx","sql":"CREATE UNIQUE INDEX \"album_invite_albumId_email_idx\" ON \"album_invite\" (\"albumId\", \"email\") WHERE (\"acceptedAt\" IS NULL AND \"revokedAt\" IS NULL);"}'::jsonb
    WHERE "name" = 'index_album_invite_albumId_email_idx';
  `).execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // The corrected override is metadata only and remains safe on rollback.
}
