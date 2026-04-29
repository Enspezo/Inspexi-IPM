-- AlterTable
ALTER TABLE "imp_quote_templates" ADD COLUMN "send_email_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "imp_quote_templates" ADD COLUMN "accepted_email_enabled" BOOLEAN NOT NULL DEFAULT true;
