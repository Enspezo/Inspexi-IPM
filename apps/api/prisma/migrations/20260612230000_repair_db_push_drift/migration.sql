-- DropForeignKey
ALTER TABLE "imp_planning_items" DROP CONSTRAINT "imp_planning_items_location_id_fkey";

-- AlterTable
ALTER TABLE "imp_custom_field_definitions" ALTER COLUMN "field_name" SET DATA TYPE TEXT,
ALTER COLUMN "label" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "imp_email_template_attachments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "imp_email_templates" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "imp_planning_sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "imp_products" DROP COLUMN "category",
ADD COLUMN     "product_group_id" UUID;

-- AlterTable
ALTER TABLE "imp_project_followers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "imp_projects" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "imp_quote_template_attachments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "imp_quotes" ADD COLUMN     "client_name" TEXT;

-- CreateTable
CREATE TABLE "imp_product_groups" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_quote_questions" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "user_id" UUID,
    "message" TEXT NOT NULL,
    "is_from_client" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_quote_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_quote_attachments" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "is_standard" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_quote_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_quote_questions_quote_id_idx" ON "imp_quote_questions"("quote_id");

-- CreateIndex
CREATE INDEX "imp_quote_attachments_quote_id_idx" ON "imp_quote_attachments"("quote_id");

-- RenameForeignKey
ALTER TABLE "imp_quote_template_docx_revisions" RENAME CONSTRAINT "imp_quote_template_rtf_revisions_template_id_fkey" TO "imp_quote_template_docx_revisions_template_id_fkey";

-- RenameForeignKey
ALTER TABLE "imp_quote_template_docx_revisions" RENAME CONSTRAINT "imp_quote_template_rtf_revisions_uploaded_by_id_fkey" TO "imp_quote_template_docx_revisions_uploaded_by_id_fkey";

-- AddForeignKey
ALTER TABLE "imp_product_groups" ADD CONSTRAINT "imp_product_groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_products" ADD CONSTRAINT "imp_products_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "imp_product_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_questions" ADD CONSTRAINT "imp_quote_questions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "imp_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_questions" ADD CONSTRAINT "imp_quote_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_quote_attachments" ADD CONSTRAINT "imp_quote_attachments_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "imp_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_planning_items" ADD CONSTRAINT "imp_planning_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "imp_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

