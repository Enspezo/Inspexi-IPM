-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');

-- CreateEnum
CREATE TYPE "CustomFieldEntityType" AS ENUM ('CONTACT', 'CONTACT_ADDRESS', 'LOCATION', 'REQUEST', 'QUOTE', 'PRODUCT');

-- AlterTable
ALTER TABLE "imp_contacts" ADD COLUMN "custom_fields" JSONB;

-- AlterTable
ALTER TABLE "imp_contact_addresses" ADD COLUMN "custom_fields" JSONB;

-- AlterTable
ALTER TABLE "imp_locations" ADD COLUMN "custom_fields" JSONB;

-- AlterTable
ALTER TABLE "imp_requests" ADD COLUMN "custom_fields" JSONB;

-- AlterTable
ALTER TABLE "imp_quotes" ADD COLUMN "custom_fields" JSONB;

-- AlterTable
ALTER TABLE "imp_products" ADD COLUMN "custom_fields" JSONB;

-- CreateTable
CREATE TABLE "imp_custom_field_definitions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "entity_type" "CustomFieldEntityType" NOT NULL,
    "field_name" VARCHAR NOT NULL,
    "label" VARCHAR NOT NULL,
    "field_type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_custom_field_definitions_org_id_entity_type_idx" ON "imp_custom_field_definitions"("org_id", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "imp_custom_field_definitions_org_id_entity_type_field_name_key" ON "imp_custom_field_definitions"("org_id", "entity_type", "field_name");

-- AddForeignKey
ALTER TABLE "imp_custom_field_definitions" ADD CONSTRAINT "imp_custom_field_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
