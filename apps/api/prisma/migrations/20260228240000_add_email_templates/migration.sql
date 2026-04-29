-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('OFFERTE_VERSTUURD', 'OFFERTE_ANTWOORD', 'AFSPRAAK_BEVESTIGING', 'AFSPRAAK_VERPLAATST', 'AFSPRAAK_ACCEPTATIE', 'CONTACT_EMAIL', 'UITNODIGING', 'WACHTWOORD_RESET', 'NOTIFICATIE');

-- CreateTable
CREATE TABLE "imp_email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_json" JSONB NOT NULL,
    "body_html" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_email_templates_org_id_type_idx" ON "imp_email_templates"("org_id", "type");

-- AddForeignKey
ALTER TABLE "imp_email_templates" ADD CONSTRAINT "imp_email_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_email_templates" ADD CONSTRAINT "imp_email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
