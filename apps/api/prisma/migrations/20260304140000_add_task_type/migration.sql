-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('TO_DO', 'EMAIL', 'TELEFOONGESPREK', 'DOCUMENT', 'GOEDKEURING');

-- AlterTable
ALTER TABLE "imp_tasks" ADD COLUMN "task_type" "TaskType" NOT NULL DEFAULT 'TO_DO';
