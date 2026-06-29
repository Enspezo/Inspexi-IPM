-- Add soft-delete tombstone column to the three execution-record models so they
-- can travel as full create/update/delete sync entities over the PWA v2-contract
-- (VisualInspection / MeasurementRecord / MeasurementSheetRecord had no deletedAt).

ALTER TABLE "imp_visual_inspections" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "imp_measurement_records" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "imp_measurement_sheet_records" ADD COLUMN "deleted_at" TIMESTAMP(3);
