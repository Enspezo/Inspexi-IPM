-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('IN_VOORBEREIDING', 'IN_UITVOERING', 'UITGEVOERD', 'WACHT_OP_KLANT');

-- AlterEnum
ALTER TYPE "DocumentEntityType" ADD VALUE 'WORK_ORDER';

-- AlterEnum
ALTER TYPE "NoteEntityType" ADD VALUE 'WORK_ORDER';

-- CreateTable
CREATE TABLE "imp_work_orders" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "planning_item_id" UUID NOT NULL,
    "work_order_number" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'IN_VOORBEREIDING',
    "internal_notes" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_work_order_lines" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "product_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "vat_rate" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "line_total" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "imp_work_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_work_orders_work_order_number_key" ON "imp_work_orders"("work_order_number");

-- CreateIndex
CREATE INDEX "imp_work_orders_org_id_status_idx" ON "imp_work_orders"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_work_orders_org_id_planning_item_id_idx" ON "imp_work_orders"("org_id", "planning_item_id");

-- AddForeignKey
ALTER TABLE "imp_work_orders" ADD CONSTRAINT "imp_work_orders_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_work_orders" ADD CONSTRAINT "imp_work_orders_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_work_orders" ADD CONSTRAINT "imp_work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_work_order_lines" ADD CONSTRAINT "imp_work_order_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "imp_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_work_order_lines" ADD CONSTRAINT "imp_work_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "imp_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
