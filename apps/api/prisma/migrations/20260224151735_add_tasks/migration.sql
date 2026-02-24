-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TE_DOEN', 'MEE_BEZIG', 'VOLTOOID');

-- CreateEnum
CREATE TYPE "TaskEntityType" AS ENUM ('CONTACT', 'REQUEST', 'QUOTE');

-- CreateTable
CREATE TABLE "imp_tasks" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TE_DOEN',
    "entity_type" "TaskEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "assignee_id" UUID,
    "created_by_id" UUID NOT NULL,
    "deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_tasks_org_id_status_idx" ON "imp_tasks"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_tasks_assignee_id_idx" ON "imp_tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "imp_tasks_entity_type_entity_id_idx" ON "imp_tasks"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "imp_tasks" ADD CONSTRAINT "imp_tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_tasks" ADD CONSTRAINT "imp_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_tasks" ADD CONSTRAINT "imp_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
