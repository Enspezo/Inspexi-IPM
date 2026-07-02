-- CreateTable
CREATE TABLE "imp_inspector_certificates" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT,
    "issue_date" DATE NOT NULL,
    "valid_until" DATE,
    "issuer" TEXT NOT NULL,
    "storage_key" TEXT,
    "file_name" TEXT,
    "original_name" TEXT,
    "mime_type" TEXT,
    "size" INTEGER,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imp_inspector_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_inspector_certificates_org_id_user_id_idx" ON "imp_inspector_certificates"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "imp_inspector_certificates_user_id_idx" ON "imp_inspector_certificates"("user_id");

-- AddForeignKey
ALTER TABLE "imp_inspector_certificates" ADD CONSTRAINT "imp_inspector_certificates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "imp_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imp_inspector_certificates" ADD CONSTRAINT "imp_inspector_certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
