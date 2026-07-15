/*
  Warnings:

  - You are about to drop the column `audit_log_id` on the `imp_ai_pending_actions` table. All the data in the column will be lost.

*/
-- NB: de GiST-index `imp_asset_nodes_path_gist` (ltree `path`) staat als raw SQL
-- in migratie 20260629093657 en niet in het Prisma-schema. `migrate dev` wil hem
-- daarom telkens droppen; dat laten we bewust NIET gebeuren (idempotente recreate
-- onderaan zodat een schone replay de index behoudt).

-- AlterTable
ALTER TABLE "imp_ai_pending_actions" DROP COLUMN "audit_log_id";

-- AlterTable
ALTER TABLE "imp_ai_usage_logs" ADD COLUMN     "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0;

-- Behoud de GiST-index (raw SQL, buiten Prisma-schema).
CREATE INDEX IF NOT EXISTS "imp_asset_nodes_path_gist" ON "imp_asset_nodes" USING GIST ("path");
