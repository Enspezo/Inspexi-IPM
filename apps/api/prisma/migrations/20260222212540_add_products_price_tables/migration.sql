-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'TIERED');

-- CreateTable
CREATE TABLE "imp_products" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "default_vat" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_price_tables" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_price_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_price_table_items" (
    "id" UUID NOT NULL,
    "price_table_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price_type" "PriceType" NOT NULL,
    "base_price" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_price_table_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_price_tiers" (
    "id" UUID NOT NULL,
    "price_table_item_id" UUID NOT NULL,
    "from_qty" DOUBLE PRECISION NOT NULL,
    "to_qty" DOUBLE PRECISION,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "imp_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_contact_price_tables" (
    "contact_id" UUID NOT NULL,
    "price_table_id" UUID NOT NULL,

    CONSTRAINT "imp_contact_price_tables_pkey" PRIMARY KEY ("contact_id","price_table_id")
);

-- AddForeignKey
ALTER TABLE "imp_products" ADD CONSTRAINT "imp_products_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_price_tables" ADD CONSTRAINT "imp_price_tables_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_price_table_items" ADD CONSTRAINT "imp_price_table_items_price_table_id_fkey" FOREIGN KEY ("price_table_id") REFERENCES "imp_price_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_price_table_items" ADD CONSTRAINT "imp_price_table_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "imp_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_price_tiers" ADD CONSTRAINT "imp_price_tiers_price_table_item_id_fkey" FOREIGN KEY ("price_table_item_id") REFERENCES "imp_price_table_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_price_tables" ADD CONSTRAINT "imp_contact_price_tables_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_contact_price_tables" ADD CONSTRAINT "imp_contact_price_tables_price_table_id_fkey" FOREIGN KEY ("price_table_id") REFERENCES "imp_price_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
