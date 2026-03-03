-- CreateEnum
CREATE TYPE "QuoteTemplateType" AS ENUM ('BLOCKS', 'RTF');

-- AlterTable: add RTF fields to imp_quote_templates
ALTER TABLE "imp_quote_templates" ADD COLUMN "template_type" "QuoteTemplateType" NOT NULL DEFAULT 'BLOCKS';
ALTER TABLE "imp_quote_templates" ADD COLUMN "rtf_storage_key" TEXT;
ALTER TABLE "imp_quote_templates" ADD COLUMN "rtf_file_name" TEXT;
ALTER TABLE "imp_quote_templates" ADD COLUMN "rtf_file_size" INTEGER;
ALTER TABLE "imp_quote_templates" ADD COLUMN "rtf_preview_html" TEXT;

-- CreateTable
CREATE TABLE "imp_quote_template_rtf_revisions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_quote_template_rtf_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_quote_template_rtf_revisions_template_id_idx" ON "imp_quote_template_rtf_revisions"("template_id");

-- AddForeignKey
ALTER TABLE "imp_quote_template_rtf_revisions" ADD CONSTRAINT "imp_quote_template_rtf_revisions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_quote_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_template_rtf_revisions" ADD CONSTRAINT "imp_quote_template_rtf_revisions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
