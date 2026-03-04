-- CreateTable
CREATE TABLE "imp_email_template_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_template_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_email_template_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_email_template_attachments_email_template_id_idx" ON "imp_email_template_attachments"("email_template_id");

-- AddForeignKey
ALTER TABLE "imp_email_template_attachments" ADD CONSTRAINT "imp_email_template_attachments_email_template_id_fkey" FOREIGN KEY ("email_template_id") REFERENCES "imp_email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_email_template_attachments" ADD CONSTRAINT "imp_email_template_attachments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
