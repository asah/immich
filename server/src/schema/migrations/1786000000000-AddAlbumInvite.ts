import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "album_invite" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "albumId" uuid NOT NULL, "inviterId" uuid NOT NULL, "email" character varying NOT NULL, "tokenHash" bytea NOT NULL, "role" album_user_role_enum NOT NULL DEFAULT 'viewer', "expiresAt" timestamp with time zone NOT NULL, "acceptedAt" timestamp with time zone, "revokedAt" timestamp with time zone, "createdAt" timestamp with time zone NOT NULL DEFAULT now(), CONSTRAINT "album_invite_pkey" PRIMARY KEY ("id"), CONSTRAINT "album_invite_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON DELETE CASCADE, CONSTRAINT "album_invite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user" ("id") ON DELETE CASCADE);`.execute(db);
  await sql`CREATE UNIQUE INDEX "album_invite_tokenHash_uq" ON "album_invite" ("tokenHash");`.execute(db);
  await sql`CREATE UNIQUE INDEX "album_invite_active_album_email_uq" ON "album_invite" ("albumId", "email") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "album_invite";`.execute(db);
}
