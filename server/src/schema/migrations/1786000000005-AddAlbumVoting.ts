import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "album" ADD COLUMN "voting" jsonb`.execute(db);
  await sql.raw(`
    CREATE TABLE "album_vote" (
      "id" uuid PRIMARY KEY DEFAULT immich_uuid_v7(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "albumId" uuid NOT NULL REFERENCES "album"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "assetId" uuid NOT NULL REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "userId" uuid REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "sharedLinkId" uuid REFERENCES "shared_link"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "anonymousVoterHash" bytea,
      "value" smallint NOT NULL CHECK ("value" IN (-1, 1)),
      CHECK (("userId" IS NOT NULL) <> ("anonymousVoterHash" IS NOT NULL))
    );
    CREATE UNIQUE INDEX "album_vote_user_uq" ON "album_vote" ("albumId", "assetId", "userId") WHERE "userId" IS NOT NULL;
    CREATE UNIQUE INDEX "album_vote_anonymous_uq" ON "album_vote" ("albumId", "assetId", "sharedLinkId", "anonymousVoterHash") WHERE "anonymousVoterHash" IS NOT NULL;
    CREATE INDEX "album_vote_album_asset_idx" ON "album_vote" ("albumId", "assetId");
    CREATE TRIGGER "album_vote_updatedAt" BEFORE UPDATE ON "album_vote" FOR EACH ROW EXECUTE FUNCTION updated_at();
  `).execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "album_vote"`.execute(db);
  await sql`ALTER TABLE "album" DROP COLUMN "voting"`.execute(db);
}
