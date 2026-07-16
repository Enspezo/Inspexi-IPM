-- CreateEnum
CREATE TYPE "AiReviewRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiReviewItemSeverity" AS ENUM ('CRITICAL', 'WARNING', 'SUGGESTION', 'INFO');

-- CreateEnum
CREATE TYPE "AiReviewItemStatus" AS ENUM ('OPEN', 'CHECKED', 'DISMISSED');

-- NB: Prisma's migrate dev generated a `DROP INDEX "imp_asset_nodes_path_gist"`
-- here because the ltree GIST index is maintained outside the Prisma schema
-- (Prisma cannot express a GIST index). Dropping it would silently degrade the
-- AssetNode-tree ltree queries, so the drop is intentionally stripped from this
-- migration (same handcrafted fix as earlier availability/hardening migrations).

-- AlterTable
ALTER TABLE "imp_organizations" ADD COLUMN     "ai_review_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_review_instructions" TEXT,
ADD COLUMN     "inspection_review_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "imp_ai_review_runs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "inspection_plan_id" UUID NOT NULL,
    "generated_document_id" UUID,
    "status" "AiReviewRunStatus" NOT NULL DEFAULT 'PENDING',
    "triggered_by" UUID,
    "model" TEXT NOT NULL,
    "summary" TEXT,
    "error_message" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_ai_review_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_ai_review_items" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "severity" "AiReviewItemSeverity" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "asset_node_id" UUID,
    "finding_id" UUID,
    "measurement_record_id" UUID,
    "status" "AiReviewItemStatus" NOT NULL DEFAULT 'OPEN',
    "checked_by" UUID,
    "checked_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_ai_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_ai_review_runs_org_id_inspection_plan_id_idx" ON "imp_ai_review_runs"("org_id", "inspection_plan_id");

-- CreateIndex
CREATE INDEX "imp_ai_review_items_run_id_idx" ON "imp_ai_review_items"("run_id");

-- AddForeignKey
ALTER TABLE "imp_ai_review_runs" ADD CONSTRAINT "imp_ai_review_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_review_runs" ADD CONSTRAINT "imp_ai_review_runs_inspection_plan_id_fkey" FOREIGN KEY ("inspection_plan_id") REFERENCES "imp_inspection_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_review_runs" ADD CONSTRAINT "imp_ai_review_runs_generated_document_id_fkey" FOREIGN KEY ("generated_document_id") REFERENCES "imp_generated_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_review_runs" ADD CONSTRAINT "imp_ai_review_runs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_review_items" ADD CONSTRAINT "imp_ai_review_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "imp_ai_review_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_review_items" ADD CONSTRAINT "imp_ai_review_items_asset_node_id_fkey" FOREIGN KEY ("asset_node_id") REFERENCES "imp_asset_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_review_items" ADD CONSTRAINT "imp_ai_review_items_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "imp_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_ai_review_items" ADD CONSTRAINT "imp_ai_review_items_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
