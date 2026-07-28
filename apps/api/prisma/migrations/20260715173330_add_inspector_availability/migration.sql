-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('DIENSTVERBAND', 'FREELANCE');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('BESCHIKBAAR', 'GEBLOKKEERD');

-- NB: Prisma's migrate dev generated a `DROP INDEX "imp_asset_nodes_path_gist"`
-- here because the ltree GIST index is maintained outside the Prisma schema
-- (Prisma cannot express a GIST index). Dropping it would silently degrade the
-- AssetNode-tree ltree queries, so the drop is intentionally stripped from this
-- migration (same handcrafted fix as earlier availability/hardening migrations).

-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN     "employment_type" "EmploymentType";

-- CreateTable
CREATE TABLE "imp_availability_templates" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_availability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_availability_template_slots" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "imp_availability_template_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_user_schedule_assignments" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_user_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_availability_exceptions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AvailabilityExceptionType" NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "interval_weeks" INTEGER NOT NULL DEFAULT 1,
    "recur_start_date" DATE,
    "recur_end_date" DATE,
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_availability_templates_org_id_is_deleted_idx" ON "imp_availability_templates"("org_id", "is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "imp_availability_templates_org_id_name_key" ON "imp_availability_templates"("org_id", "name");

-- CreateIndex
CREATE INDEX "imp_availability_template_slots_template_id_idx" ON "imp_availability_template_slots"("template_id");

-- CreateIndex
CREATE INDEX "imp_user_schedule_assignments_org_id_user_id_valid_from_idx" ON "imp_user_schedule_assignments"("org_id", "user_id", "valid_from");

-- CreateIndex
CREATE INDEX "imp_availability_exceptions_org_id_user_id_is_deleted_idx" ON "imp_availability_exceptions"("org_id", "user_id", "is_deleted");

-- AddForeignKey
ALTER TABLE "imp_availability_templates" ADD CONSTRAINT "imp_availability_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_availability_template_slots" ADD CONSTRAINT "imp_availability_template_slots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_availability_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_user_schedule_assignments" ADD CONSTRAINT "imp_user_schedule_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_user_schedule_assignments" ADD CONSTRAINT "imp_user_schedule_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_user_schedule_assignments" ADD CONSTRAINT "imp_user_schedule_assignments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_availability_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_availability_exceptions" ADD CONSTRAINT "imp_availability_exceptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_availability_exceptions" ADD CONSTRAINT "imp_availability_exceptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
