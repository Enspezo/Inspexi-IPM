-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN "workday_start" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "imp_organizations" ADD COLUMN "workday_end" INTEGER NOT NULL DEFAULT 17;
