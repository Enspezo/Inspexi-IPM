-- DropIndex
DROP INDEX "imp_audit_logs_entity_type_entity_id_idx";

-- DropIndex
DROP INDEX "imp_client_magic_links_token_idx";

-- DropIndex
DROP INDEX "imp_client_users_email_idx";

-- CreateIndex
CREATE INDEX "imp_assets_org_id_updated_at_idx" ON "imp_assets"("org_id", "updated_at");

-- CreateIndex
CREATE INDEX "imp_audit_logs_entity_type_entity_id_created_at_idx" ON "imp_audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_findings_org_id_status_idx" ON "imp_findings"("org_id", "status");

-- CreateIndex
CREATE INDEX "imp_inspection_client_access_client_user_id_idx" ON "imp_inspection_client_access"("client_user_id");

-- CreateIndex
CREATE INDEX "imp_inspection_plans_org_id_updated_at_idx" ON "imp_inspection_plans"("org_id", "updated_at");

-- CreateIndex
CREATE INDEX "imp_photos_org_id_created_at_idx" ON "imp_photos"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "imp_quotes_org_id_created_by_idx" ON "imp_quotes"("org_id", "created_by");

-- CreateIndex
CREATE INDEX "imp_refresh_tokens_token_hash_idx" ON "imp_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "imp_users_org_id_is_deleted_idx" ON "imp_users"("org_id", "is_deleted");
