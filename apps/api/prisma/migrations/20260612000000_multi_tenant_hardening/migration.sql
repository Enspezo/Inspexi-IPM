-- Multi-tenant hardening (plan punten 8, 10, 11)

-- Punt 8: Organization.isActive voor offboarding
ALTER TABLE "imp_organizations" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Punt 10: globale unique-constraints vervangen door per-org composites
DROP INDEX "imp_quotes_quote_number_key";
DROP INDEX "imp_projects_project_number_key";
DROP INDEX "imp_work_orders_work_order_number_key";

CREATE UNIQUE INDEX "imp_quotes_org_id_quote_number_key" ON "imp_quotes"("org_id", "quote_number");
CREATE UNIQUE INDEX "imp_projects_org_id_project_number_key" ON "imp_projects"("org_id", "project_number");
CREATE UNIQUE INDEX "imp_work_orders_org_id_work_order_number_key" ON "imp_work_orders"("org_id", "work_order_number");

-- Punt 11: composite indexes voor org-scoped queries
CREATE INDEX "imp_contacts_org_id_idx" ON "imp_contacts"("org_id");
CREATE INDEX "imp_quotes_org_id_status_idx" ON "imp_quotes"("org_id", "status");
CREATE INDEX "imp_requests_org_id_status_idx" ON "imp_requests"("org_id", "status");
