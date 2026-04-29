-- CreateEnum
CREATE TYPE "PlanningStatus" AS ENUM ('NOG_TE_PLANNEN', 'CONCEPT', 'GEPLAND', 'AFGEROND', 'VERVALLEN');

-- CreateEnum
CREATE TYPE "AcceptanceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDING', 'PROCESSED');

-- AlterEnum
ALTER TYPE "DocumentEntityType" ADD VALUE 'PLANNING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'AFSPRAAK_ACCEPTATIE_VERZOEK';
ALTER TYPE "NotificationType" ADD VALUE 'AFSPRAAK_GEACCEPTEERD';
ALTER TYPE "NotificationType" ADD VALUE 'AFSPRAAK_GEWEIGERD';
ALTER TYPE "NotificationType" ADD VALUE 'AFSPRAAK_VERPLAATST';
ALTER TYPE "NotificationType" ADD VALUE 'AFSPRAAK_VERZETTEN_VERZOEK';
ALTER TYPE "NotificationType" ADD VALUE 'AFSPRAAK_BEVESTIGING_VERSTUURD';

-- AlterEnum
ALTER TYPE "TaskEntityType" ADD VALUE 'PLANNING';

-- AlterTable
ALTER TABLE "imp_documents" ADD COLUMN     "is_shared_with_client" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam';

-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN     "color" TEXT,
ADD COLUMN     "ical_token" TEXT;
UPDATE "imp_users" SET "ical_token" = gen_random_uuid()::text WHERE "ical_token" IS NULL;
ALTER TABLE "imp_users" ALTER COLUMN "ical_token" SET NOT NULL;

-- CreateTable
CREATE TABLE "imp_planning_items" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "quote_id" UUID,
    "contact_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "product_id" UUID,
    "product_name" TEXT NOT NULL,
    "status" "PlanningStatus" NOT NULL DEFAULT 'NOG_TE_PLANNEN',
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "scheduled_date" TIMESTAMP(3),
    "duration_hours" DOUBLE PRECISION,
    "end_time" TIMESTAMP(3),
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "internal_notes" TEXT,
    "public_token" TEXT NOT NULL,
    "replaced_by_id" UUID,
    "replaces_id" UUID,
    "original_date" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_planning_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_planning_inspectors" (
    "id" UUID NOT NULL,
    "planning_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "acceptance_status" "AcceptanceStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_note" TEXT,

    CONSTRAINT "imp_planning_inspectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_planning_history" (
    "id" UUID NOT NULL,
    "planning_item_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_planning_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_reschedule_requests" (
    "id" UUID NOT NULL,
    "planning_item_id" UUID NOT NULL,
    "requested_by" UUID,
    "client_name" TEXT,
    "preferred_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RescheduleStatus" NOT NULL DEFAULT 'PENDING',
    "processed_by" UUID,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_reschedule_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_planning_followers" (
    "id" UUID NOT NULL,
    "planning_item_id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_planning_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_planning_items_public_token_key" ON "imp_planning_items"("public_token");

-- CreateIndex
CREATE INDEX "imp_planning_items_org_id_status_idx" ON "imp_planning_items"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_planning_items_org_id_scheduled_date_idx" ON "imp_planning_items"("org_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "imp_planning_items_contact_id_idx" ON "imp_planning_items"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_planning_inspectors_planning_item_id_user_id_key" ON "imp_planning_inspectors"("planning_item_id", "user_id");

-- CreateIndex
CREATE INDEX "imp_planning_history_planning_item_id_idx" ON "imp_planning_history"("planning_item_id");

-- CreateIndex
CREATE INDEX "imp_reschedule_requests_planning_item_id_idx" ON "imp_reschedule_requests"("planning_item_id");

-- CreateIndex
CREATE INDEX "imp_planning_followers_planning_item_id_idx" ON "imp_planning_followers"("planning_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_users_ical_token_key" ON "imp_users"("ical_token");

-- AddForeignKey
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_inspectors" ADD CONSTRAINT "imp_planning_inspectors_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_inspectors" ADD CONSTRAINT "imp_planning_inspectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_history" ADD CONSTRAINT "imp_planning_history_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_history" ADD CONSTRAINT "imp_planning_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_reschedule_requests" ADD CONSTRAINT "imp_reschedule_requests_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_followers" ADD CONSTRAINT "imp_planning_followers_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_followers" ADD CONSTRAINT "imp_planning_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
