-- WP-A3 (B-101): traceability of internal staff signing — records the staff user
-- who signed. Plain nullable uuid (no FK), consistent with generated_by/edited_by.
-- AlterTable
ALTER TABLE "imp_document_signatures" ADD COLUMN     "signed_by_user_id" UUID;
