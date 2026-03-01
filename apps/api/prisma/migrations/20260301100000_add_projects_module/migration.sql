-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIEF', 'ON_HOLD', 'AFGEROND', 'GEANNULEERD');

-- AlterEnum: TaskEntityType
ALTER TYPE "TaskEntityType" ADD VALUE 'PROJECT';

-- AlterEnum: DocumentEntityType
ALTER TYPE "DocumentEntityType" ADD VALUE 'PROJECT';

-- AlterEnum: NotificationType
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_AANGEMAAKT';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_STATUS_GEWIJZIGD';

-- CreateTable
CREATE TABLE "imp_projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "project_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIEF',
    "contact_id" UUID NOT NULL,
    "location_id" UUID,
    "project_manager_id" UUID NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_end_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_project_followers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_project_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_projects_project_number_key" ON "imp_projects"("project_number");

-- CreateIndex
CREATE INDEX "imp_projects_org_id_status_idx" ON "imp_projects"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_projects_contact_id_idx" ON "imp_projects"("contact_id");

-- CreateIndex
CREATE INDEX "imp_projects_project_manager_id_idx" ON "imp_projects"("project_manager_id");

-- CreateIndex
CREATE INDEX "imp_project_followers_project_id_idx" ON "imp_project_followers"("project_id");

-- AlterTable: Add projectId to existing tables
ALTER TABLE "imp_requests" ADD COLUMN "project_id" UUID;
ALTER TABLE "imp_quotes" ADD COLUMN "project_id" UUID;
ALTER TABLE "imp_planning_items" ADD COLUMN "project_id" UUID;

-- AddForeignKey
ALTER TABLE "imp_projects" ADD CONSTRAINT "imp_projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imp_projects" ADD CONSTRAINT "imp_projects_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "imp_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imp_projects" ADD CONSTRAINT "imp_projects_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "imp_projects" ADD CONSTRAINT "imp_projects_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imp_projects" ADD CONSTRAINT "imp_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "imp_project_followers" ADD CONSTRAINT "imp_project_followers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "imp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imp_project_followers" ADD CONSTRAINT "imp_project_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imp_requests" ADD CONSTRAINT "imp_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "imp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "imp_quotes" ADD CONSTRAINT "imp_quotes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "imp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "imp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
