-- DropForeignKey
ALTER TABLE "imp_work_orders" DROP CONSTRAINT "imp_work_orders_planning_item_id_fkey";

-- AlterTable
ALTER TABLE "imp_work_orders" ALTER COLUMN "planning_item_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "imp_work_orders" ADD CONSTRAINT "imp_work_orders_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
