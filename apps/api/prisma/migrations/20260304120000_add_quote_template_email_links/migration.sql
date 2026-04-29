-- AlterEnum
ALTER TYPE "EmailTemplateType" ADD VALUE 'OFFERTE_GEACCEPTEERD';

-- AlterTable
ALTER TABLE "imp_quote_templates" ADD COLUMN "send_email_template_id" UUID,
ADD COLUMN "accepted_email_template_id" UUID;

-- AddForeignKey
ALTER TABLE "imp_quote_templates" ADD CONSTRAINT "imp_quote_templates_send_email_template_id_fkey" FOREIGN KEY ("send_email_template_id") REFERENCES "imp_email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_templates" ADD CONSTRAINT "imp_quote_templates_accepted_email_template_id_fkey" FOREIGN KEY ("accepted_email_template_id") REFERENCES "imp_email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
