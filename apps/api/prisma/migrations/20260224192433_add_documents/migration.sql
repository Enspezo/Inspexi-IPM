-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('CONTACT', 'REQUEST', 'QUOTE', 'PRODUCT', 'TASK');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_GEUPLOAD';

-- CreateTable
CREATE TABLE "imp_documents" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "entity_type" "DocumentEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "description" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_documents_org_id_entity_type_entity_id_idx" ON "imp_documents"("org_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "imp_documents_uploaded_by_id_idx" ON "imp_documents"("uploaded_by_id");

-- AddForeignKey
ALTER TABLE "imp_documents" ADD CONSTRAINT "imp_documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_documents" ADD CONSTRAINT "imp_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
