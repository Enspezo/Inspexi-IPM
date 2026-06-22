-- CreateEnum
CREATE TYPE "NumberingModel" AS ENUM ('REQUEST', 'QUOTE', 'PROJECT', 'PRODUCT');

-- CreateEnum
CREATE TYPE "NumberingMode" AS ENUM ('SEQUENTIAL', 'RANDOM');

-- CreateEnum
CREATE TYPE "NumberingReset" AS ENUM ('CONTINUOUS', 'PER_YEAR', 'PER_MONTH');

-- AlterTable
ALTER TABLE "imp_products" ADD COLUMN     "product_code" TEXT;

-- AlterTable
ALTER TABLE "imp_requests" ADD COLUMN     "request_number" TEXT;

-- CreateTable
CREATE TABLE "imp_numbering_schemes" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "model" "NumberingModel" NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "mode" "NumberingMode" NOT NULL DEFAULT 'SEQUENTIAL',
    "start" INTEGER NOT NULL DEFAULT 1,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "digits" INTEGER NOT NULL DEFAULT 4,
    "reset_policy" "NumberingReset" NOT NULL DEFAULT 'CONTINUOUS',
    "allow_manual_entry" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_numbering_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_numbering_counters" (
    "id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_numbering_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_numbering_schemes_org_id_model_key" ON "imp_numbering_schemes"("org_id", "model");

-- CreateIndex
CREATE UNIQUE INDEX "imp_numbering_counters_scheme_id_period_key_key" ON "imp_numbering_counters"("scheme_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "imp_products_org_id_product_code_key" ON "imp_products"("org_id", "product_code");

-- CreateIndex
CREATE UNIQUE INDEX "imp_requests_org_id_request_number_key" ON "imp_requests"("org_id", "request_number");

-- AddForeignKey
ALTER TABLE "imp_numbering_schemes" ADD CONSTRAINT "imp_numbering_schemes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_numbering_counters" ADD CONSTRAINT "imp_numbering_counters_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "imp_numbering_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

