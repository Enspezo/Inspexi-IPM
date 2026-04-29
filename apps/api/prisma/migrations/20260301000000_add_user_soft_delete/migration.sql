-- AlterTable
ALTER TABLE "imp_users" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "imp_users" ADD COLUMN "deleted_at" TIMESTAMP(3);
