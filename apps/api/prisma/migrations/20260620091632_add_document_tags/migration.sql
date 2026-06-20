-- CreateTable
CREATE TABLE "imp_document_tags" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_document_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imp_document_tag_assignments" (
    "document_id" UUID NOT NULL,
    "document_tag_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_document_tag_assignments_pkey" PRIMARY KEY ("document_id","document_tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_document_tags_org_id_name_key" ON "imp_document_tags"("org_id", "name");

-- CreateIndex
CREATE INDEX "imp_document_tag_assignments_org_id_idx" ON "imp_document_tag_assignments"("org_id");

-- CreateIndex
CREATE INDEX "imp_document_tag_assignments_document_tag_id_idx" ON "imp_document_tag_assignments"("document_tag_id");

-- AddForeignKey
ALTER TABLE "imp_document_tags" ADD CONSTRAINT "imp_document_tags_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_tag_assignments" ADD CONSTRAINT "imp_document_tag_assignments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "imp_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_document_tag_assignments" ADD CONSTRAINT "imp_document_tag_assignments_document_tag_id_fkey" FOREIGN KEY ("document_tag_id") REFERENCES "imp_document_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
