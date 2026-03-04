-- Convert RTF template support to DOCX

-- Rename enum value RTF → DOCX
ALTER TYPE "QuoteTemplateType" RENAME VALUE 'RTF' TO 'DOCX';

-- Rename columns on imp_quote_templates
ALTER TABLE "imp_quote_templates" RENAME COLUMN "rtf_storage_key" TO "docx_storage_key";
ALTER TABLE "imp_quote_templates" RENAME COLUMN "rtf_file_name" TO "docx_file_name";
ALTER TABLE "imp_quote_templates" RENAME COLUMN "rtf_file_size" TO "docx_file_size";

-- Drop the preview HTML column (no longer needed — preview is client-side)
ALTER TABLE "imp_quote_templates" DROP COLUMN IF EXISTS "rtf_preview_html";

-- Rename revisions table
ALTER TABLE "imp_quote_template_rtf_revisions" RENAME TO "imp_quote_template_docx_revisions";

-- Rename the constraint and index names for consistency
ALTER INDEX "imp_quote_template_rtf_revisions_template_id_idx" RENAME TO "imp_quote_template_docx_revisions_template_id_idx";
ALTER INDEX "imp_quote_template_rtf_revisions_pkey" RENAME TO "imp_quote_template_docx_revisions_pkey";
