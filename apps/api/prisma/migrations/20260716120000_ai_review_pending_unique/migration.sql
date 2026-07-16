-- TOCTOU-bescherming op de "max één lopende AI-analyse per plan"-guard
-- (PRD-13 review-feedback): twee gelijktijdige POSTs kunnen beide de
-- findFirst-check in AiReviewService.startRun passeren. Deze partial unique
-- index laat de database de verliezer afvangen; de service vertaalt de
-- P2002-fout naar een nette 409.
--
-- NB: Prisma kan geen partial (WHERE-)index uitdrukken, dus deze index leeft —
-- net als de ltree-GIST-index imp_asset_nodes_path_gist — buiten het
-- Prisma-schema. Een toekomstige `migrate dev` genereert er een
-- `DROP INDEX "imp_ai_review_runs_pending_plan_key"` voor: die regel altijd
-- handmatig strippen.
CREATE UNIQUE INDEX "imp_ai_review_runs_pending_plan_key"
  ON "imp_ai_review_runs"("inspection_plan_id")
  WHERE status = 'PENDING';
