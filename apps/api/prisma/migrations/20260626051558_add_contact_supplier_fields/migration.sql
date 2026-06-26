-- AlterTable
ALTER TABLE "imp_contacts" ADD COLUMN     "is_supplier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_conditions" TEXT,
ADD COLUMN     "supplier_customer_number" TEXT,
ADD COLUMN     "supplier_rating" BOOLEAN;

-- CreateIndex
CREATE INDEX "imp_contacts_org_id_is_supplier_idx" ON "imp_contacts"("org_id", "is_supplier");
