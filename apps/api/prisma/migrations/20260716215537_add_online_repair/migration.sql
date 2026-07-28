-- CreateEnum
CREATE TYPE "RepairAccessType" AS ENUM ('CLIENT_USER', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "RepairSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'HERSTELVERKLARING';

-- DropForeignKey
ALTER TABLE "imp_finding_resolutions" DROP CONSTRAINT "imp_finding_resolutions_resolved_by_client_user_id_fkey";

-- NB: de door `migrate dev` gegenereerde regel `DROP INDEX "imp_asset_nodes_path_gist"` is hier
-- handmatig gestript — die GiST-index leeft bewust buiten het Prisma-schema (zie CLAUDE.md).

-- AlterTable
ALTER TABLE "imp_classification_options" ADD COLUMN     "is_critical" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "imp_finding_resolutions" ADD COLUMN     "repair_session_id" UUID,
ALTER COLUMN "resolved_by_client_user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "imp_findings" ADD COLUMN     "is_critical" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "imp_inspection_plans" ADD COLUMN     "critical_repair_notified_at" TIMESTAMP(3),
ADD COLUMN     "online_repair_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "online_repair_default" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "imp_repair_sessions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "access_type" "RepairAccessType" NOT NULL,
    "status" "RepairSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "token" TEXT NOT NULL,
    "client_user_id" UUID,
    "contact_name" TEXT,
    "company_name" TEXT,
    "email" TEXT,
    "generated_document_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_repair_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_repair_sessions_token_key" ON "imp_repair_sessions"("token");

-- CreateIndex
CREATE INDEX "imp_repair_sessions_org_id_inspection_plan_id_idx" ON "imp_repair_sessions"("org_id", "inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_finding_resolutions_repair_session_id_idx" ON "imp_finding_resolutions"("repair_session_id");

-- CreateIndex
CREATE INDEX "imp_findings_inspection_plan_id_is_critical_status_idx" ON "imp_findings"("inspection_plan_id", "is_critical", "status");

-- AddForeignKey
ALTER TABLE "imp_finding_resolutions" ADD CONSTRAINT "imp_finding_resolutions_resolved_by_client_user_id_fkey" FOREIGN KEY ("resolved_by_client_user_id") REFERENCES "imp_client_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_finding_resolutions" ADD CONSTRAINT "imp_finding_resolutions_repair_session_id_fkey" FOREIGN KEY ("repair_session_id") REFERENCES "imp_repair_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_repair_sessions" ADD CONSTRAINT "imp_repair_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_repair_sessions" ADD CONSTRAINT "imp_repair_sessions_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_repair_sessions" ADD CONSTRAINT "imp_repair_sessions_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "imp_client_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_repair_sessions" ADD CONSTRAINT "imp_repair_sessions_generated_document_id_fkey" FOREIGN KEY ("generated_document_id") REFERENCES "imp_generated_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
