-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "imp_audit_logs" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "changes" JSONB,
    "snapshot" JSONB,
    "user_id" UUID NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imp_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imp_audit_logs_entity_type_entity_id_idx" ON "imp_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "imp_audit_logs_org_id_created_at_idx" ON "imp_audit_logs"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_audit_logs_user_id_idx" ON "imp_audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "imp_audit_logs" ADD CONSTRAINT "imp_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "imp_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
