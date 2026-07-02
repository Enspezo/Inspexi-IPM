-- Sync hot-path indexes (PR perf/sync-hotpad, bevindingen H11 + M6)
--
-- H11: de /sync pull filtert per model op { orgId, OR: [createdAt gt, updatedAt gt] }.
-- Deze vijf uitvoerings-modellen hadden alleen @@index([orgId]); de composiet
-- (org_id, updated_at) laat de pull incrementeel scannen i.p.v. een full org-scan.
CREATE INDEX "imp_findings_org_id_updated_at_idx" ON "imp_findings"("org_id", "updated_at");

CREATE INDEX "imp_visual_inspections_org_id_updated_at_idx" ON "imp_visual_inspections"("org_id", "updated_at");

CREATE INDEX "imp_measurement_records_org_id_updated_at_idx" ON "imp_measurement_records"("org_id", "updated_at");

CREATE INDEX "imp_measurement_sheet_records_org_id_updated_at_idx" ON "imp_measurement_sheet_records"("org_id", "updated_at");

CREATE INDEX "imp_standalone_measurements_org_id_updated_at_idx" ON "imp_standalone_measurements"("org_id", "updated_at");

-- M6: SyncQueue had geen enkele index. resolve() query't op
-- (entity_type, entity_id, status) met orderBy created_at desc; de worker/wachtrij
-- scant op (status, created_at).
CREATE INDEX "imp_sync_queue_entity_type_entity_id_status_idx" ON "imp_sync_queue"("entity_type", "entity_id", "status");

CREATE INDEX "imp_sync_queue_status_created_at_idx" ON "imp_sync_queue"("status", "created_at");
