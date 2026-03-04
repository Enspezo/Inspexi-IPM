-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('EMAIL', 'TELEFOONGESPREK');

-- CreateEnum
CREATE TYPE "FollowUpAssigneeType" AS ENUM ('SYSTEM', 'QUOTE_OWNER', 'SPECIFIC_USER');

-- AlterEnum
ALTER TYPE "EmailTemplateType" ADD VALUE 'OFFERTE_FOLLOW_UP';

-- CreateTable
CREATE TABLE "imp_quote_template_follow_ups" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "delay_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_template_id" UUID,
    "default_notes" TEXT,
    "assignee_type" "FollowUpAssigneeType" NOT NULL DEFAULT 'QUOTE_OWNER',
    "assignee_user_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_quote_template_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_quote_template_follow_ups_template_id_idx" ON "imp_quote_template_follow_ups"("template_id");

-- AddForeignKey
ALTER TABLE "imp_quote_template_follow_ups" ADD CONSTRAINT "imp_quote_template_follow_ups_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_quote_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_template_follow_ups" ADD CONSTRAINT "imp_quote_template_follow_ups_email_template_id_fkey" FOREIGN KEY ("email_template_id") REFERENCES "imp_email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_template_follow_ups" ADD CONSTRAINT "imp_quote_template_follow_ups_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
