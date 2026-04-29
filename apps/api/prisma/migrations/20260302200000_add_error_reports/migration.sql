-- CreateEnum (NoteEntityType — added to schema)
CREATE TYPE "NoteEntityType" AS ENUM ('CONTACT', 'REQUEST', 'QUOTE', 'PLANNING', 'PROJECT', 'USER');

-- CreateEnum (ErrorReportStatus)
CREATE TYPE "ErrorReportStatus" AS ENUM ('OPEN', 'IN_BEHANDELING', 'OPGELOST');

-- AlterEnum (add FOUTMELDING_INGEDIEND to NotificationType)
ALTER TYPE "NotificationType" ADD VALUE 'FOUTMELDING_INGEDIEND';

-- CreateTable (imp_error_reports)
CREATE TABLE "imp_error_reports" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "user_id" UUID,
    "error_message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "component_stack" TEXT,
    "user_description" TEXT,
    "page_url" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "status" "ErrorReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_error_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_error_reports_status_created_at_idx" ON "imp_error_reports"("status", "created_at");

-- AddForeignKey
ALTER TABLE "imp_error_reports" ADD CONSTRAINT "imp_error_reports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_error_reports" ADD CONSTRAINT "imp_error_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
