-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'HERSTEL_AFGEROND';
ALTER TYPE "NotificationType" ADD VALUE 'HERSTEL_CONFLICT';
ALTER TYPE "NotificationType" ADD VALUE 'HERINSPECTIE_VOORSTEL';

-- DropForeignKey
ALTER TABLE "imp_generated_documents" DROP CONSTRAINT "imp_generated_documents_document_template_id_fkey";

-- NB: de door `migrate dev` gegenereerde regel `DROP INDEX "imp_asset_nodes_path_gist"` is hier
-- handmatig gestript — die GiST-index leeft bewust buiten het Prisma-schema (zie CLAUDE.md).

-- AlterTable
ALTER TABLE "imp_generated_documents" ALTER COLUMN "document_template_id" DROP NOT NULL,
ALTER COLUMN "generated_by" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "imp_generated_documents" ADD CONSTRAINT "imp_generated_documents_document_template_id_fkey" FOREIGN KEY ("document_template_id") REFERENCES "imp_document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
