-- PRD-16 fase 4: org-brede kill-switch voor de onderweg-tracker.
ALTER TABLE "imp_organizations" ADD COLUMN "travel_tracking_enabled" BOOLEAN NOT NULL DEFAULT true;
