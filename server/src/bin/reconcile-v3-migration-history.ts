import postgres from 'postgres';

const migrationNames = [
  '1784986754473-ConvertUserPasswordEmptyStringToNull',
  '1784986754474-AlbumDescriptionNullable',
] as const;

const url = process.env.DB_URL;
if (!url) {
  throw new Error('DB_URL is required');
}

const sql = postgres(url, { max: 1 });

const main = async () => {
try {
  const existing = await sql<{ name: string }[]>`
    SELECT "name" FROM "kysely_migrations" WHERE "name" IN ${sql(migrationNames)}
  `;

  if (existing.length === migrationNames.length) {
    console.log('v3.2 migration history is already reconciled');
  } else if (existing.length > 0) {
    throw new Error('Partial v3.2 migration history found; restore the database and investigate before continuing');
  } else {
    const bounds = await sql<{ previous: string; next: string; albumVoting: string }[]>`
      SELECT
        (SELECT "timestamp" FROM "kysely_migrations" WHERE "name" = '1784836013770-MinFacePreferenceMigration') AS "previous",
        (SELECT "timestamp" FROM "kysely_migrations" WHERE "name" = '1785744909196-AddStories') AS "next",
        (SELECT "timestamp" FROM "kysely_migrations" WHERE "name" = '1786000000005-AddAlbumVoting') AS "albumVoting"
    `;
    const { previous, next, albumVoting } = bounds[0] ?? {};
    const start = Date.parse(previous);
    const end = Date.parse(next);
    if (!albumVoting || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new Error('Could not establish safe migration-history bounds');
    }

    const first = new Date(start + (end - start) / 3).toISOString();
    const second = new Date(start + ((end - start) * 2) / 3).toISOString();

    await sql.begin(async (tx) => {
      await tx`ALTER TABLE "user" ALTER COLUMN "password" DROP NOT NULL`;
      await tx`ALTER TABLE "user" ALTER COLUMN "password" SET DEFAULT NULL`;
      await tx`UPDATE "user" SET "password" = NULL WHERE "password" = ''`;
      await tx`ALTER TABLE "album" ALTER COLUMN "description" DROP NOT NULL`;
      await tx`ALTER TABLE "album" ALTER COLUMN "description" SET DEFAULT NULL`;
      await tx`UPDATE "album" SET "description" = NULL WHERE "description" = ''`;
      await tx`
        INSERT INTO "kysely_migrations" ("name", "timestamp")
        VALUES (${migrationNames[0]}, ${first}), (${migrationNames[1]}, ${second})
      `;
    });
    console.log('Reconciled v3.2 migration history; it is now safe to run normal migrations');
  }
} finally {
  await sql.end();
}
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
