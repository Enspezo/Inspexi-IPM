-- Online herstel (PRD-14, review #9): max één herstelmelding per constatering
-- per sessie. Vangt de dubbelklik-race die de niet-atomische precheck in
-- claimFinding mist (P2002 → nette 400). Rijen met repair_session_id NULL
-- (oude PENDING_VERIFICATION-flow) botsen nooit: Postgres-uniques negeren NULL.
-- Handmatig geschreven (migrate dev genereert hier ook een spurious
-- DROP INDEX "imp_asset_nodes_path_gist" — zie CLAUDE.md).

-- CreateIndex
CREATE UNIQUE INDEX "imp_finding_resolutions_finding_id_repair_session_id_key" ON "imp_finding_resolutions"("finding_id", "repair_session_id");
