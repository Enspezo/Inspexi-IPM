-- CreateEnum
CREATE TYPE "LocationTypeScope" AS ENUM ('INSPECTION', 'CRM');

-- AlterTable: classify existing location-type definitions (default INSPECTION keeps inspection behaviour unchanged)
ALTER TABLE "imp_location_type_definitions" ADD COLUMN "scope" "LocationTypeScope" NOT NULL DEFAULT 'INSPECTION';

-- AlterTable: nullable FK from a CRM location to its type definition
ALTER TABLE "imp_locations" ADD COLUMN "location_type_id" UUID;

-- Data: seed system-level (org_id NULL = shared) CRM location types.
-- Codes mirror the former hardcoded `object_type` options; colors are derived
-- from the former Tailwind pill colors in the portal.
INSERT INTO "imp_location_type_definitions"
  ("id", "org_id", "code", "name", "description", "icon", "color", "scope", "norm_types", "is_active", "is_system", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), NULL, 'woning',      'Woning',      NULL, NULL, '#3B82F6', 'CRM', '[]'::jsonb, true, true, 0, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'kantoor',     'Kantoor',     NULL, NULL, '#A855F7', 'CRM', '[]'::jsonb, true, true, 1, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'industrieel', 'Industrieel', NULL, NULL, '#F97316', 'CRM', '[]'::jsonb, true, true, 2, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'winkel',      'Winkel',      NULL, NULL, '#22C55E', 'CRM', '[]'::jsonb, true, true, 3, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'overig',      'Overig',      NULL, NULL, '#6B7280', 'CRM', '[]'::jsonb, true, true, 4, NOW(), NOW());

-- Data: backfill existing locations by mapping their free-text object_type → the CRM type with the same code.
UPDATE "imp_locations" l
SET "location_type_id" = t."id"
FROM "imp_location_type_definitions" t
WHERE t."org_id" IS NULL
  AND t."scope" = 'CRM'
  AND t."code" = l."object_type"
  AND l."object_type" IS NOT NULL;

-- AlterTable: drop the migrated free-text column (single source of truth is now location_type_id)
ALTER TABLE "imp_locations" DROP COLUMN "object_type";

-- CreateIndex
CREATE INDEX "imp_location_type_definitions_scope_idx" ON "imp_location_type_definitions"("scope");

-- CreateIndex
CREATE INDEX "imp_locations_location_type_id_idx" ON "imp_locations"("location_type_id");

-- AddForeignKey
ALTER TABLE "imp_locations" ADD CONSTRAINT "imp_locations_location_type_id_fkey" FOREIGN KEY ("location_type_id") REFERENCES "imp_location_type_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
