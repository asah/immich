import { Kysely, sql } from 'kysely';

/** Repairs databases that applied an early Stories migration while keeping fresh installs idempotent. */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "story" ALTER COLUMN "title" DROP DEFAULT;`.execute(db);
  await sql`ALTER TABLE "user_ai_consent" DROP CONSTRAINT IF EXISTS "user_ai_consent_pkey";`.execute(db);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "user_ai_consent_userId_providerId_uq" ON "user_ai_consent" ("userId", "providerId");`.execute(db);
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_credential_fingerprint_check') THEN
      ALTER TABLE "ai_credential" ADD CONSTRAINT "ai_credential_fingerprint_check" CHECK (length(fingerprint) > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ai_consent_disclosureHash_check') THEN
      ALTER TABLE "user_ai_consent" ADD CONSTRAINT "user_ai_consent_disclosureHash_check" CHECK (octet_length("providerDisclosureHash") = 32);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_ai_draft_commands_check') THEN
      ALTER TABLE "story_ai_draft" ADD CONSTRAINT "story_ai_draft_commands_check" CHECK (jsonb_typeof(commands) = 'array');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_ai_draft_diff_check') THEN
      ALTER TABLE "story_ai_draft" ADD CONSTRAINT "story_ai_draft_diff_check" CHECK (jsonb_typeof(diff) = 'object');
    END IF;
  END $$;`.execute(db);
  await sql`DROP INDEX IF EXISTS "ai_provider_enabled_user_uq";`.execute(db);
  await sql`DROP INDEX IF EXISTS "ai_provider_enabled_server_uq";`.execute(db);
  await sql`CREATE UNIQUE INDEX "ai_provider_enabled_user_uq" ON "ai_provider" ("userId") WHERE ("userId" IS NOT NULL AND enabled);`.execute(db);
  await sql`CREATE UNIQUE INDEX "ai_provider_enabled_server_uq" ON "ai_provider" ("enabled") WHERE ("userId" IS NULL AND enabled);`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "ai_credential_updatedAt" BEFORE UPDATE ON "ai_credential" FOR EACH ROW EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "ai_provider_updatedAt" BEFORE UPDATE ON "ai_provider" FOR EACH ROW EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "user_ai_consent_updatedAt" BEFORE UPDATE ON "user_ai_consent" FOR EACH ROW EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES
    ('index_ai_provider_enabled_user_uq', '{"type":"index","name":"ai_provider_enabled_user_uq","sql":"CREATE UNIQUE INDEX \\"ai_provider_enabled_user_uq\\" ON \\"ai_provider\\" (\\"userId\\") WHERE (\\"userId\\" IS NOT NULL AND enabled);"}'::jsonb),
    ('index_ai_provider_enabled_server_uq', '{"type":"index","name":"ai_provider_enabled_server_uq","sql":"CREATE UNIQUE INDEX \\"ai_provider_enabled_server_uq\\" ON \\"ai_provider\\" (\\"enabled\\") WHERE (\\"userId\\" IS NULL AND enabled);"}'::jsonb),
    ('trigger_ai_credential_updatedAt', '{"type":"trigger","name":"ai_credential_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"ai_credential_updatedAt\\"\\n  BEFORE UPDATE ON \\"ai_credential\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb),
    ('trigger_ai_provider_updatedAt', '{"type":"trigger","name":"ai_provider_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"ai_provider_updatedAt\\"\\n  BEFORE UPDATE ON \\"ai_provider\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb),
    ('trigger_user_ai_consent_updatedAt', '{"type":"trigger","name":"user_ai_consent_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"user_ai_consent_updatedAt\\"\\n  BEFORE UPDATE ON \\"user_ai_consent\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb)
  ON CONFLICT ("name") DO UPDATE SET "value" = EXCLUDED."value";`.execute(db);
}

export async function down(): Promise<void> {
  // The preceding migration now creates the canonical schema, so no reversal is required.
}
