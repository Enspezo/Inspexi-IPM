/*
  Warnings:

  - You are about to drop the column `asset_id` on the `imp_findings` table. All the data in the column will be lost.
  - You are about to drop the column `asset_id` on the `imp_location_image_markers` table. All the data in the column will be lost.
  - You are about to drop the column `location_id` on the `imp_location_images` table. All the data in the column will be lost.
  - You are about to drop the column `asset_id` on the `imp_measurement_records` table. All the data in the column will be lost.
  - You are about to drop the column `asset_id` on the `imp_measurement_sheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `linked_asset_id` on the `imp_standalone_measurements` table. All the data in the column will be lost.
  - You are about to drop the column `location_id` on the `imp_standalone_measurements` table. All the data in the column will be lost.
  - You are about to drop the column `asset_id` on the `imp_visual_inspections` table. All the data in the column will be lost.
  - You are about to drop the `imp_assets` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `imp_inspection_locations` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[node_id]` on the table `imp_location_images` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `asset_node_id` to the `imp_findings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inspection_plan_id` to the `imp_findings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `node_id` to the `imp_location_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `asset_node_id` to the `imp_measurement_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inspection_plan_id` to the `imp_measurement_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `asset_node_id` to the `imp_measurement_sheet_records` table without a default value. This is not possible if the table is not empty.
  - Made the column `inspection_plan_id` on table `imp_measurement_sheet_records` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `location_node_id` to the `imp_standalone_measurements` table without a default value. This is not possible if the table is not empty.
  - Added the required column `asset_node_id` to the `imp_visual_inspections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inspection_plan_id` to the `imp_visual_inspections` table without a default value. This is not possible if the table is not empty.

*/
-- Enable ltree extension (required by the imp_asset_nodes.path column below)
CREATE EXTENSION IF NOT EXISTS ltree;

-- CreateEnum
CREATE TYPE "AssetNodeType" AS ENUM ('LOCATION', 'ASSET');

-- DropForeignKey
ALTER TABLE "imp_assets" DROP CONSTRAINT "imp_assets_created_by_fkey";

-- DropForeignKey
ALTER TABLE "imp_assets" DROP CONSTRAINT "imp_assets_inspection_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_assets" DROP CONSTRAINT "imp_assets_location_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_assets" DROP CONSTRAINT "imp_assets_org_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_assets" DROP CONSTRAINT "imp_assets_parent_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_findings" DROP CONSTRAINT "imp_findings_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_inspection_locations" DROP CONSTRAINT "imp_inspection_locations_created_by_fkey";

-- DropForeignKey
ALTER TABLE "imp_inspection_locations" DROP CONSTRAINT "imp_inspection_locations_inspection_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_inspection_locations" DROP CONSTRAINT "imp_inspection_locations_org_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_inspection_locations" DROP CONSTRAINT "imp_inspection_locations_parent_location_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_location_image_markers" DROP CONSTRAINT "imp_location_image_markers_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_location_images" DROP CONSTRAINT "imp_location_images_location_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_measurement_records" DROP CONSTRAINT "imp_measurement_records_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_measurement_sheet_records" DROP CONSTRAINT "imp_measurement_sheet_records_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_measurement_sheet_records" DROP CONSTRAINT "imp_measurement_sheet_records_inspection_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_standalone_measurements" DROP CONSTRAINT "imp_standalone_measurements_linked_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_standalone_measurements" DROP CONSTRAINT "imp_standalone_measurements_location_id_fkey";

-- DropForeignKey
ALTER TABLE "imp_visual_inspections" DROP CONSTRAINT "imp_visual_inspections_asset_id_fkey";

-- DropIndex
DROP INDEX "imp_findings_asset_id_idx";

-- DropIndex
DROP INDEX "imp_location_image_markers_asset_id_idx";

-- DropIndex
DROP INDEX "imp_location_images_location_id_idx";

-- DropIndex
DROP INDEX "imp_location_images_location_id_key";

-- DropIndex
DROP INDEX "imp_measurement_records_asset_id_idx";

-- DropIndex
DROP INDEX "imp_measurement_sheet_records_asset_id_idx";

-- DropIndex
DROP INDEX "imp_standalone_measurements_linked_asset_id_idx";

-- DropIndex
DROP INDEX "imp_standalone_measurements_location_id_idx";

-- DropIndex
DROP INDEX "imp_visual_inspections_asset_id_idx";

-- AlterTable
ALTER TABLE "imp_findings" DROP COLUMN "asset_id",
ADD COLUMN     "asset_node_id" UUID NOT NULL,
ADD COLUMN     "inspection_plan_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "imp_inspection_plans" ADD COLUMN     "location_id" UUID;

-- AlterTable
ALTER TABLE "imp_location_image_markers" DROP COLUMN "asset_id",
ADD COLUMN     "asset_node_id" UUID;

-- AlterTable
ALTER TABLE "imp_location_images" DROP COLUMN "location_id",
ADD COLUMN     "node_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "imp_measurement_records" DROP COLUMN "asset_id",
ADD COLUMN     "asset_node_id" UUID NOT NULL,
ADD COLUMN     "inspection_plan_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "imp_measurement_sheet_records" DROP COLUMN "asset_id",
ADD COLUMN     "asset_node_id" UUID NOT NULL,
ALTER COLUMN "inspection_plan_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "imp_standalone_measurements" DROP COLUMN "linked_asset_id",
DROP COLUMN "location_id",
ADD COLUMN     "linked_asset_node_id" UUID,
ADD COLUMN     "location_node_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "imp_visual_inspections" DROP COLUMN "asset_id",
ADD COLUMN     "asset_node_id" UUID NOT NULL,
ADD COLUMN     "inspection_plan_id" UUID NOT NULL;

-- DropTable
DROP TABLE "imp_assets";

-- DropTable
DROP TABLE "imp_inspection_locations";

-- CreateTable
CREATE TABLE "imp_asset_nodes" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "node_type" "AssetNodeType" NOT NULL,
    "parent_id" UUID,
    "root_location_id" UUID,
    "type_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT,
    "description" TEXT,
    "technical_data" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "path" ltree,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),
    "created_by" UUID,
    "device_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "imp_asset_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_plan_locations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "asset_node_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "imp_inspection_plan_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_asset_nodes_root_location_id_key" ON "imp_asset_nodes"("root_location_id");

-- CreateIndex
CREATE INDEX "imp_asset_nodes_org_id_idx" ON "imp_asset_nodes"("org_id");

-- CreateIndex
CREATE INDEX "imp_asset_nodes_parent_id_idx" ON "imp_asset_nodes"("parent_id");

-- CreateIndex
CREATE INDEX "imp_asset_nodes_org_id_updated_at_idx" ON "imp_asset_nodes"("org_id", "updated_at");

-- CreateIndex
CREATE INDEX "imp_inspection_plan_locations_asset_node_id_idx" ON "imp_inspection_plan_locations"("asset_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_plan_locations_inspection_plan_id_asset_node_key" ON "imp_inspection_plan_locations"("inspection_plan_id", "asset_node_id");

-- CreateIndex
CREATE INDEX "imp_findings_asset_node_id_idx" ON "imp_findings"("asset_node_id");

-- CreateIndex
CREATE INDEX "imp_findings_inspection_plan_id_idx" ON "imp_findings"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_inspection_plans_location_id_idx" ON "imp_inspection_plans"("location_id");

-- CreateIndex
CREATE INDEX "imp_location_image_markers_asset_node_id_idx" ON "imp_location_image_markers"("asset_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_location_images_node_id_key" ON "imp_location_images"("node_id");

-- CreateIndex
CREATE INDEX "imp_location_images_node_id_idx" ON "imp_location_images"("node_id");

-- CreateIndex
CREATE INDEX "imp_measurement_records_asset_node_id_idx" ON "imp_measurement_records"("asset_node_id");

-- CreateIndex
CREATE INDEX "imp_measurement_records_inspection_plan_id_idx" ON "imp_measurement_records"("inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_measurement_sheet_records_asset_node_id_idx" ON "imp_measurement_sheet_records"("asset_node_id");

-- CreateIndex
CREATE INDEX "imp_standalone_measurements_location_node_id_idx" ON "imp_standalone_measurements"("location_node_id");

-- CreateIndex
CREATE INDEX "imp_standalone_measurements_linked_asset_node_id_idx" ON "imp_standalone_measurements"("linked_asset_node_id");

-- CreateIndex
CREATE INDEX "imp_visual_inspections_asset_node_id_idx" ON "imp_visual_inspections"("asset_node_id");

-- CreateIndex
CREATE INDEX "imp_visual_inspections_inspection_plan_id_idx" ON "imp_visual_inspections"("inspection_plan_id");

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_nodes" ADD CONSTRAINT "imp_asset_nodes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_nodes" ADD CONSTRAINT "imp_asset_nodes_root_location_id_fkey" FOREIGN KEY ("root_location_id") REFERENCES "imp_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_nodes" ADD CONSTRAINT "imp_asset_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "imp_asset_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_asset_nodes" ADD CONSTRAINT "imp_asset_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plan_locations" ADD CONSTRAINT "imp_inspection_plan_locations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plan_locations" ADD CONSTRAINT "imp_inspection_plan_locations_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plan_locations" ADD CONSTRAINT "imp_inspection_plan_locations_asset_node_id_fkey" FOREIGN KEY ("asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_visual_inspections" ADD CONSTRAINT "imp_visual_inspections_asset_node_id_fkey" FOREIGN KEY ("asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_visual_inspections" ADD CONSTRAINT "imp_visual_inspections_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_records" ADD CONSTRAINT "imp_measurement_records_asset_node_id_fkey" FOREIGN KEY ("asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_records" ADD CONSTRAINT "imp_measurement_records_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_asset_node_id_fkey" FOREIGN KEY ("asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_findings" ADD CONSTRAINT "imp_findings_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_records" ADD CONSTRAINT "imp_measurement_sheet_records_asset_node_id_fkey" FOREIGN KEY ("asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_sheet_records" ADD CONSTRAINT "imp_measurement_sheet_records_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_images" ADD CONSTRAINT "imp_location_images_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_location_image_markers" ADD CONSTRAINT "imp_location_image_markers_asset_node_id_fkey" FOREIGN KEY ("asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_standalone_measurements" ADD CONSTRAINT "imp_standalone_measurements_location_node_id_fkey" FOREIGN KEY ("location_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_standalone_measurements" ADD CONSTRAINT "imp_standalone_measurements_linked_asset_node_id_fkey" FOREIGN KEY ("linked_asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- ltree materialized-path maintenance for imp_asset_nodes
-- ============================================================================

-- BEFORE INSERT OR UPDATE OF parent_id: compute this node's own path + depth.
-- Root nodes (parent_id IS NULL) get a single label (their id, hyphens stripped)
-- and depth 0. Child nodes inherit the parent path with their own label appended
-- and depth = nlevel(parent.path).
CREATE OR REPLACE FUNCTION imp_asset_nodes_set_path() RETURNS trigger AS $$
DECLARE
  parent_path ltree;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := text2ltree(replace(NEW.id::text, '-', ''));
    NEW.depth := 0;
  ELSE
    SELECT path INTO parent_path FROM imp_asset_nodes WHERE id = NEW.parent_id;
    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'Parent asset node % has no path (cannot attach child %)', NEW.parent_id, NEW.id;
    END IF;
    NEW.path := parent_path || text2ltree(replace(NEW.id::text, '-', ''));
    NEW.depth := nlevel(parent_path);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER imp_asset_nodes_set_path_trg
  BEFORE INSERT OR UPDATE OF parent_id ON imp_asset_nodes
  FOR EACH ROW EXECUTE FUNCTION imp_asset_nodes_set_path();

-- AFTER UPDATE OF parent_id: rewrite all descendant paths/depths to hang off the
-- node's new path. The node's own row was already updated by the BEFORE trigger;
-- the descendant UPDATE only touches path/depth (not parent_id) so it does not
-- recurse into these triggers.
CREATE OR REPLACE FUNCTION imp_asset_nodes_rewrite_descendants() RETURNS trigger AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE imp_asset_nodes
    SET path  = NEW.path || subpath(path, nlevel(OLD.path)),
        depth = nlevel(NEW.path || subpath(path, nlevel(OLD.path))) - 1
    WHERE path <@ OLD.path
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER imp_asset_nodes_rewrite_descendants_trg
  AFTER UPDATE OF parent_id ON imp_asset_nodes
  FOR EACH ROW EXECUTE FUNCTION imp_asset_nodes_rewrite_descendants();

-- GiST index for ltree ancestor/descendant queries (<@, @>, ~, etc.)
CREATE INDEX "imp_asset_nodes_path_gist" ON "imp_asset_nodes" USING GIST ("path");
