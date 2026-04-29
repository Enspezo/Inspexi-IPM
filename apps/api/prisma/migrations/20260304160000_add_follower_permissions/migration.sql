-- AlterTable
ALTER TABLE "imp_project_followers" ADD COLUMN "can_view_general" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "imp_project_followers" ADD COLUMN "can_view_requests" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "imp_project_followers" ADD COLUMN "can_view_quotes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "imp_project_followers" ADD COLUMN "can_view_planning" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "imp_project_followers" ADD COLUMN "can_view_documents" BOOLEAN NOT NULL DEFAULT false;

-- Set all permissions to true for internal followers (users with user_id)
UPDATE "imp_project_followers"
SET "can_view_general" = true,
    "can_view_requests" = true,
    "can_view_quotes" = true,
    "can_view_planning" = true,
    "can_view_documents" = true
WHERE "user_id" IS NOT NULL;
