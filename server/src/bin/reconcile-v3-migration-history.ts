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

    if (existing.length > 0 && existing.length < migrationNames.length) {
      throw new Error('Partial v3.2 migration history found; restore the database and investigate before continuing');
    }

    const bounds = await sql<{ previous: string; next: string; albumVoting: string }[]>`
      SELECT
        (SELECT "timestamp" FROM "kysely_migrations" WHERE "name" = '1784836013770-MinFacePreferenceMigration') AS "previous",
        (SELECT "timestamp" FROM "kysely_migrations" WHERE "name" = '1785744909196-AddStories') AS "next",
        (SELECT "timestamp" FROM "kysely_migrations" WHERE "name" = '1786000000005-AddAlbumVoting') AS "albumVoting"
    `;
    const { previous, next, albumVoting } = bounds[0] ?? {};
    const start = Date.parse(previous);
    const end = Date.parse(next);
    if (!albumVoting || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start < 3) {
      throw new Error('Could not establish safe migration-history bounds');
    }

    const first = new Date(start + (end - start) / 3).toISOString();
    const second = new Date(start + ((end - start) * 2) / 3).toISOString();

    if (existing.length === migrationNames.length) {
      const current = await sql<{ name: string; timestamp: string }[]>`
        SELECT "name", "timestamp" FROM "kysely_migrations"
        WHERE "name" IN ${sql(migrationNames)} ORDER BY "timestamp"
      `;
      if (
        current[0]?.name === migrationNames[0] &&
        current[1]?.name === migrationNames[1] &&
        Date.parse(current[0].timestamp) > start &&
        Date.parse(current[1].timestamp) < end
      ) {
        console.log('v3.2 migration history is already reconciled');
        return;
      }

      const intervening = await sql<{ name: string }[]>`
        SELECT "name" FROM "kysely_migrations"
        WHERE "timestamp" > ${previous} AND "timestamp" < ${next}
          AND "name" NOT IN ${sql(migrationNames)}
      `;
      if (intervening.length > 0) {
        throw new Error('Other migrations occupy the v3.2 history slot; investigate before continuing');
      }

      await sql.begin(async (tx) => {
        await tx`UPDATE "kysely_migrations" SET "timestamp" = ${first} WHERE "name" = ${migrationNames[0]}`;
        await tx`UPDATE "kysely_migrations" SET "timestamp" = ${second} WHERE "name" = ${migrationNames[1]}`;
      });
      console.log('Reordered existing v3.2 migration history');
      return;
    }

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
  } finally {
    await sql.end();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
