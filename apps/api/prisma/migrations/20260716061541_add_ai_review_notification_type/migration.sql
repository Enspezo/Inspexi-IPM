-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AI_REVIEW_GEREED';

-- DropIndex
DROP INDEX "imp_asset_nodes_path_gist";
