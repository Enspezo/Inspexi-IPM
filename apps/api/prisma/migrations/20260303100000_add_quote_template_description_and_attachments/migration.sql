-- AlterTable
ALTER TABLE "imp_quote_templates" ADD COLUMN "description" TEXT;

-- CreateTable
CREATE TABLE "imp_quote_template_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_quote_template_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_quote_template_attachments_template_id_idx" ON "imp_quote_template_attachments"("template_id");

-- AddForeignKey
ALTER TABLE "imp_quote_template_attachments" ADD CONSTRAINT "imp_quote_template_attachments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "imp_quote_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
