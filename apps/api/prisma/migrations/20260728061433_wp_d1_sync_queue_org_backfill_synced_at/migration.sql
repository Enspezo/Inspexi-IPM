-- WP-D1 (B-209/B-223e) — sync-versieanker + conflicten in de pull.
--
-- 1. imp_sync_queue krijgt org-scoping (org_id) zodat open conflicten veilig
--    org-gescoped in de /sync-pull-envelope kunnen meereizen. Bestaande rijen
--    worden gebackfilld via de pushende gebruiker (user_id → imp_users.org_id).
-- 2. Verplichte backfill uit eigenaarsbesluit A1: elke rij van de zeven
--    sync-entiteiten krijgt `synced_at = updated_at` waar synced_at NULL is.
--    Daarmee heeft élk bestaand record een pull-basis; nieuwe serverwrites
--    vullen synced_at voortaan via de Prisma-middleware (prisma.service.ts).
--
-- NB: de door `migrate dev` gegenereerde `DROP INDEX "imp_asset_nodes_path_gist"`
-- is hier bewust handmatig verwijderd — die ltree-GIST-index leeft buiten het
-- Prisma-schema (zie CLAUDE.md).

-- AlterTable
ALTER TABLE "imp_sync_queue" ADD COLUMN     "org_id" UUID;

-- Backfill org_id op bestaande queue-rijen via de pushende gebruiker.
UPDATE "imp_sync_queue" sq
SET "org_id" = u."org_id"
FROM "imp_users" u
WHERE sq."user_id" = u."id" AND sq."org_id" IS NULL;

-- CreateIndex
CREATE INDEX "imp_sync_queue_org_id_status_idx" ON "imp_sync_queue"("org_id", "status");

-- Backfill synced_at = updated_at (besluit A1, verplicht vóór release):
-- "geen basis bekend" mag nooit meer "geen conflict" betekenen; na deze
-- backfill heeft elk record een geldige basis voor de conflictdetectie.
UPDATE "imp_inspection_plans"         SET "synced_at" = "updated_at" WHERE "synced_at" IS NULL;
UPDATE "imp_asset_nodes"              SET "synced_at" = "updated_at" WHERE "synced_at" IS NULL;
UPDATE "imp_findings"                 SET "synced_at" = "updated_at" WHERE "synced_at" IS NULL;
UPDATE "imp_visual_inspections"       SET "synced_at" = "updated_at" WHERE "synced_at" IS NULL;
UPDATE "imp_measurement_records"      SET "synced_at" = "updated_at" WHERE "synced_at" IS NULL;
UPDATE "imp_measurement_sheet_records" SET "synced_at" = "updated_at" WHERE "synced_at" IS NULL;
UPDATE "imp_standalone_measurements"  SET "synced_at" = "updated_at" WHERE "synced_at" IS NULL;
