-- CreateEnum
CREATE TYPE "TimeActivityType" AS ENUM ('VOORBEREIDING', 'UITVOERING', 'RAPPORTAGE', 'REISTIJD', 'OVERIG');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('HANDMATIG', 'AGENDA', 'INSPECTIE_AUTO', 'REIS_AUTO', 'CORRECTIE');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('CONCEPT', 'INGEDIEND', 'GOEDGEKEURD', 'AFGEWEZEN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'WEEKSTAAT_INGEDIEND';
ALTER TYPE "NotificationType" ADD VALUE 'WEEKSTAAT_GOEDGEKEURD';
ALTER TYPE "NotificationType" ADD VALUE 'WEEKSTAAT_AFGEWEZEN';
ALTER TYPE "NotificationType" ADD VALUE 'TIMER_NACHTWAKER';

-- AlterEnum
ALTER TYPE "TaskEntityType" ADD VALUE 'TIME_ENTRY';

-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN     "travel_tracking_consent_at" TIMESTAMP(3),
ADD COLUMN     "travel_tracking_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "imp_time_entries" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "activity_type" "TimeActivityType" NOT NULL,
    "source" "TimeEntrySource" NOT NULL DEFAULT 'HANDMATIG',
    "project_id" UUID,
    "inspection_plan_id" UUID,
    "planning_item_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "notes" TEXT,
    "stop_reason" TEXT,
    "needs_project_assignment" BOOLEAN NOT NULL DEFAULT false,
    "assignment_task_id" UUID,
    "corrected_by_id" UUID,
    "timesheet_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_timesheets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "week_number" INTEGER NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'CONCEPT',
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_inspector_location_pings" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "time_entry_id" UUID,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "accuracy_m" INTEGER,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_inspector_location_pings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_time_entries_org_id_user_id_started_at_idx" ON "imp_time_entries"("org_id", "user_id", "started_at");

-- CreateIndex
CREATE INDEX "imp_time_entries_org_id_project_id_idx" ON "imp_time_entries"("org_id", "project_id");

-- CreateIndex
CREATE INDEX "imp_time_entries_timesheet_id_idx" ON "imp_time_entries"("timesheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "imp_time_entries_org_id_client_id_key" ON "imp_time_entries"("org_id", "client_id");

-- CreateIndex
CREATE INDEX "imp_timesheets_org_id_status_idx" ON "imp_timesheets"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "imp_timesheets_org_id_user_id_year_week_number_key" ON "imp_timesheets"("org_id", "user_id", "year", "week_number");

-- CreateIndex
CREATE INDEX "imp_inspector_location_pings_org_id_user_id_recorded_at_idx" ON "imp_inspector_location_pings"("org_id", "user_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "imp_time_entries" ADD CONSTRAINT "imp_time_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_time_entries" ADD CONSTRAINT "imp_time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_time_entries" ADD CONSTRAINT "imp_time_entries_corrected_by_id_fkey" FOREIGN KEY ("corrected_by_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_time_entries" ADD CONSTRAINT "imp_time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "imp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_time_entries" ADD CONSTRAINT "imp_time_entries_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_time_entries" ADD CONSTRAINT "imp_time_entries_planning_item_id_fkey" FOREIGN KEY ("planning_item_id") REFERENCES "imp_planning_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_time_entries" ADD CONSTRAINT "imp_time_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "imp_timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_timesheets" ADD CONSTRAINT "imp_timesheets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_timesheets" ADD CONSTRAINT "imp_timesheets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_timesheets" ADD CONSTRAINT "imp_timesheets_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspector_location_pings" ADD CONSTRAINT "imp_inspector_location_pings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspector_location_pings" ADD CONSTRAINT "imp_inspector_location_pings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspector_location_pings" ADD CONSTRAINT "imp_inspector_location_pings_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "imp_time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Max één lopende timer per gebruiker (PRD-16 §4.3), race-vrij afgedwongen.
-- NB: deze partial index leeft — net als de ltree-GIST- en AI-review-PENDING-index —
-- búiten het Prisma-schema: strip door `migrate dev` gegenereerde DROP INDEX-regels
-- voor deze index altijd handmatig uit nieuwe migraties.
CREATE UNIQUE INDEX "imp_time_entries_running_user_key"
  ON "imp_time_entries"("user_id")
  WHERE "ended_at" IS NULL AND "is_deleted" = false;
