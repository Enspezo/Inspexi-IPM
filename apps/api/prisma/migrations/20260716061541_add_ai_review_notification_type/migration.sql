-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AI_REVIEW_GEREED';

-- NB: Prisma's migrate dev genereerde hier opnieuw een
-- `DROP INDEX "imp_asset_nodes_path_gist"` (de ltree-GIST-index leeft buiten
-- het Prisma-schema en moet uit elke gegenereerde migratie gestript worden).
-- Die regel is handmatig verwijderd — droppen zou alle AssetNode-boomqueries
-- (path <@) stilletjes naar seq-scans degraderen. De CREATE ... IF NOT EXISTS
-- hieronder herstelt de index op omgevingen waar een eerdere versie van deze
-- migratie hem al gedropt had; elders is het een no-op.
CREATE INDEX IF NOT EXISTS "imp_asset_nodes_path_gist" ON "imp_asset_nodes" USING GIST ("path");
