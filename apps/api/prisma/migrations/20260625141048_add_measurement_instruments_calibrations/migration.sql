-- CreateEnum
CREATE TYPE "MeasurementInstrumentStatus" AS ENUM ('ACTIEF', 'BUITEN_GEBRUIK', 'AFGEKEURD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MEETMIDDEL_KALIBRATIE_BINNENKORT';
ALTER TYPE "NotificationType" ADD VALUE 'MEETMIDDEL_KALIBRATIE_VERLOPEN';

-- AlterTable
ALTER TABLE "imp_measurement_sheet_records" ADD COLUMN     "used_instrument_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "imp_measurement_instruments" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "serial_number" TEXT,
    "calibration_interval_months" INTEGER NOT NULL,
    "status" "MeasurementInstrumentStatus" NOT NULL DEFAULT 'ACTIEF',
    "assigned_to_user_id" UUID,
    "notes" TEXT,
    "last_calibration_date" TIMESTAMP(3),
    "next_calibration_due" TIMESTAMP(3),
    "last_expiry_notified_stage" TEXT,
    "last_expiry_notified_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_measurement_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_measurement_instrument_calibrations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "calibration_date" TIMESTAMP(3) NOT NULL,
    "performed_by" TEXT NOT NULL,
    "certificate_number" TEXT,
    "notes" TEXT,
    "storage_key" TEXT,
    "file_name" TEXT,
    "original_name" TEXT,
    "mime_type" TEXT,
    "size" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_measurement_instrument_calibrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_user_default_instruments" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_user_default_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspection_plan_default_instruments" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_inspection_plan_default_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_measurement_instruments_org_id_next_calibration_due_idx" ON "imp_measurement_instruments"("org_id", "next_calibration_due");

-- CreateIndex
CREATE INDEX "imp_measurement_instruments_org_id_assigned_to_user_id_idx" ON "imp_measurement_instruments"("org_id", "assigned_to_user_id");

-- CreateIndex
CREATE INDEX "imp_measurement_instruments_org_id_updated_at_idx" ON "imp_measurement_instruments"("org_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "imp_measurement_instruments_org_id_code_key" ON "imp_measurement_instruments"("org_id", "code");

-- CreateIndex
CREATE INDEX "imp_measurement_instrument_calibrations_org_id_instrument_i_idx" ON "imp_measurement_instrument_calibrations"("org_id", "instrument_id");

-- CreateIndex
CREATE INDEX "imp_user_default_instruments_org_id_idx" ON "imp_user_default_instruments"("org_id");

-- CreateIndex
CREATE INDEX "imp_user_default_instruments_instrument_id_idx" ON "imp_user_default_instruments"("instrument_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_user_default_instruments_user_id_instrument_id_key" ON "imp_user_default_instruments"("user_id", "instrument_id");

-- CreateIndex
CREATE INDEX "imp_inspection_plan_default_instruments_org_id_idx" ON "imp_inspection_plan_default_instruments"("org_id");

-- CreateIndex
CREATE INDEX "imp_inspection_plan_default_instruments_instrument_id_idx" ON "imp_inspection_plan_default_instruments"("instrument_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_inspection_plan_default_instruments_inspection_plan_id__key" ON "imp_inspection_plan_default_instruments"("inspection_plan_id", "instrument_id");

-- AddForeignKey
ALTER TABLE "imp_measurement_instruments" ADD CONSTRAINT "imp_measurement_instruments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_instruments" ADD CONSTRAINT "imp_measurement_instruments_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_instrument_calibrations" ADD CONSTRAINT "imp_measurement_instrument_calibrations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_measurement_instrument_calibrations" ADD CONSTRAINT "imp_measurement_instrument_calibrations_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "imp_measurement_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_user_default_instruments" ADD CONSTRAINT "imp_user_default_instruments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_user_default_instruments" ADD CONSTRAINT "imp_user_default_instruments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_user_default_instruments" ADD CONSTRAINT "imp_user_default_instruments_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "imp_measurement_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plan_default_instruments" ADD CONSTRAINT "imp_inspection_plan_default_instruments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plan_default_instruments" ADD CONSTRAINT "imp_inspection_plan_default_instruments_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plan_default_instruments" ADD CONSTRAINT "imp_inspection_plan_default_instruments_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "imp_measurement_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
