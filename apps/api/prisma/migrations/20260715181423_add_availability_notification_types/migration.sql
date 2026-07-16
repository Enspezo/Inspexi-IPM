-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BESCHIKBAARHEID_GEWIJZIGD_DOOR_INSPECTEUR';
ALTER TYPE "NotificationType" ADD VALUE 'BESCHIKBAARHEID_GEWIJZIGD_DOOR_MANAGER';

-- NB: Prisma's migrate dev generated a `DROP INDEX "imp_asset_nodes_path_gist"`
-- here because the ltree GIST index is maintained outside the Prisma schema
-- (Prisma cannot express a GIST index). Dropping it would silently degrade the
-- AssetNode-tree ltree queries, so the drop is intentionally stripped from this
-- migration (same handcrafted fix as the fase-1 availability/hardening migrations).
