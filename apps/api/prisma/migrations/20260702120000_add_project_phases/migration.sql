-- PRD-12: Projectfasen (deelprojecten binnen een project)

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('NIET_GESTART', 'ACTIEF', 'ON_HOLD', 'AFGEROND', 'GEANNULEERD');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('OPEN', 'BEHAALD', 'VERVALLEN');

-- AlterEnum
ALTER TYPE "DocumentEntityType" ADD VALUE 'PROJECT_PHASE';

-- AlterEnum
ALTER TYPE "NoteEntityType" ADD VALUE 'PROJECT_PHASE';

-- AlterEnum
ALTER TYPE "TaskEntityType" ADD VALUE 'PROJECT_PHASE';

-- AlterTable
ALTER TABLE "imp_inspection_plans" ADD COLUMN     "project_phase_id" UUID;

-- AlterTable
ALTER TABLE "imp_planning_items" ADD COLUMN     "project_phase_id" UUID;

-- AlterTable
ALTER TABLE "imp_quotes" ADD COLUMN     "project_phase_id" UUID;

-- AlterTable
ALTER TABLE "imp_work_orders" ADD COLUMN     "project_phase_id" UUID;

-- CreateTable
CREATE TABLE "imp_project_phases" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PhaseStatus" NOT NULL DEFAULT 'NIET_GESTART',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "location_id" UUID,
    "contact_person_id" UUID,
    "start_date" DATE,
    "expected_end_date" DATE,
    "completed_at" TIMESTAMP(3),
    "budget_amount" DECIMAL(12,2),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_project_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_project_phase_followers" (
    "id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT,
    "name" TEXT,
    "can_view_general" BOOLEAN NOT NULL DEFAULT true,
    "can_view_requests" BOOLEAN NOT NULL DEFAULT false,
    "can_view_quotes" BOOLEAN NOT NULL DEFAULT true,
    "can_view_planning" BOOLEAN NOT NULL DEFAULT true,
    "can_view_documents" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_project_phase_followers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_project_phase_milestones" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "assignee_id" UUID,
    "reminder_days_before" INTEGER NOT NULL DEFAULT 7,
    "last_reminder_stage" TEXT,
    "last_reminder_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_project_phase_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_project_phases_org_id_project_id_sort_order_idx" ON "imp_project_phases"("org_id", "project_id", "sort_order");

-- CreateIndex
CREATE INDEX "imp_project_phases_project_id_status_idx" ON "imp_project_phases"("project_id", "status");

-- CreateIndex
CREATE INDEX "imp_project_phase_followers_phase_id_idx" ON "imp_project_phase_followers"("phase_id");

-- CreateIndex
CREATE INDEX "imp_project_phase_milestones_phase_id_due_date_idx" ON "imp_project_phase_milestones"("phase_id", "due_date");

-- CreateIndex
CREATE INDEX "imp_project_phase_milestones_org_id_status_due_date_idx" ON "imp_project_phase_milestones"("org_id", "status", "due_date");

-- AddForeignKey
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_project_phase_id_fkey" FOREIGN KEY ("project_phase_id") REFERENCES "imp_project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_project_phase_id_fkey" FOREIGN KEY ("project_phase_id") REFERENCES "imp_project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phases" ADD CONSTRAINT "imp_project_phases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phases" ADD CONSTRAINT "imp_project_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "imp_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phases" ADD CONSTRAINT "imp_project_phases_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phases" ADD CONSTRAINT "imp_project_phases_contact_person_id_fkey" FOREIGN KEY ("contact_person_id") REFERENCES "imp_contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phases" ADD CONSTRAINT "imp_project_phases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phase_followers" ADD CONSTRAINT "imp_project_phase_followers_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "imp_project_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phase_followers" ADD CONSTRAINT "imp_project_phase_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phase_milestones" ADD CONSTRAINT "imp_project_phase_milestones_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phase_milestones" ADD CONSTRAINT "imp_project_phase_milestones_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "imp_project_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_project_phase_milestones" ADD CONSTRAINT "imp_project_phase_milestones_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_work_orders" ADD CONSTRAINT "imp_work_orders_project_phase_id_fkey" FOREIGN KEY ("project_phase_id") REFERENCES "imp_project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspection_plans" ADD CONSTRAINT "imp_inspection_plans_project_phase_id_fkey" FOREIGN KEY ("project_phase_id") REFERENCES "imp_project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
