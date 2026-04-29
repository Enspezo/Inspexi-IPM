-- AlterTable: make location_id optional on imp_planning_items
ALTER TABLE "imp_planning_items" ALTER COLUMN "location_id" DROP NOT NULL;
