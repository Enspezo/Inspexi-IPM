-- Add missing indexes on FK and hot-path filter columns (Stap 1 — database-optimization-plan)

-- CreateIndex
CREATE INDEX "imp_contact_addresses_contact_id_idx" ON "imp_contact_addresses"("contact_id");
-- CreateIndex
CREATE INDEX "imp_contact_emails_contact_id_idx" ON "imp_contact_emails"("contact_id");
-- CreateIndex
CREATE INDEX "imp_contact_logs_contact_id_idx" ON "imp_contact_logs"("contact_id");
-- CreateIndex
CREATE INDEX "imp_contact_persons_contact_id_idx" ON "imp_contact_persons"("contact_id");
-- CreateIndex
CREATE INDEX "imp_contacts_owner_id_idx" ON "imp_contacts"("owner_id");
-- CreateIndex
CREATE INDEX "imp_invitations_org_id_email_idx" ON "imp_invitations"("org_id", "email");
-- CreateIndex
CREATE INDEX "imp_locations_contact_id_idx" ON "imp_locations"("contact_id");
-- CreateIndex
CREATE INDEX "imp_notifications_user_id_is_read_idx" ON "imp_notifications"("user_id", "is_read");
-- CreateIndex
CREATE INDEX "imp_notifications_user_id_created_at_idx" ON "imp_notifications"("user_id", "created_at");
-- CreateIndex
CREATE INDEX "imp_planning_items_quote_id_idx" ON "imp_planning_items"("quote_id");
-- CreateIndex
CREATE INDEX "imp_planning_items_project_id_idx" ON "imp_planning_items"("project_id");
-- CreateIndex
CREATE INDEX "imp_price_table_items_price_table_id_idx" ON "imp_price_table_items"("price_table_id");
-- CreateIndex
CREATE INDEX "imp_price_table_items_product_id_idx" ON "imp_price_table_items"("product_id");
-- CreateIndex
CREATE INDEX "imp_price_tiers_price_table_item_id_idx" ON "imp_price_tiers"("price_table_item_id");
-- CreateIndex
CREATE INDEX "imp_quote_approval_requests_quote_id_idx" ON "imp_quote_approval_requests"("quote_id");
-- CreateIndex
CREATE INDEX "imp_quote_lines_quote_id_idx" ON "imp_quote_lines"("quote_id");
-- CreateIndex
CREATE INDEX "imp_quotes_contact_id_idx" ON "imp_quotes"("contact_id");
-- CreateIndex
CREATE INDEX "imp_quotes_request_id_idx" ON "imp_quotes"("request_id");
-- CreateIndex
CREATE INDEX "imp_quotes_project_id_idx" ON "imp_quotes"("project_id");
-- CreateIndex
CREATE INDEX "imp_refresh_tokens_user_id_idx" ON "imp_refresh_tokens"("user_id");
-- CreateIndex
CREATE INDEX "imp_refresh_tokens_expires_at_idx" ON "imp_refresh_tokens"("expires_at");
-- CreateIndex
CREATE INDEX "imp_request_status_history_request_id_idx" ON "imp_request_status_history"("request_id");
-- CreateIndex
CREATE INDEX "imp_requests_contact_id_idx" ON "imp_requests"("contact_id");
-- CreateIndex
CREATE INDEX "imp_requests_assigned_to_idx" ON "imp_requests"("assigned_to");
-- CreateIndex
CREATE INDEX "imp_requests_project_id_idx" ON "imp_requests"("project_id");
-- CreateIndex
CREATE INDEX "imp_tasks_org_id_deadline_idx" ON "imp_tasks"("org_id", "deadline");
-- CreateIndex
CREATE INDEX "imp_tasks_created_by_id_idx" ON "imp_tasks"("created_by_id");
-- CreateIndex
CREATE INDEX "imp_work_order_lines_work_order_id_idx" ON "imp_work_order_lines"("work_order_id");
