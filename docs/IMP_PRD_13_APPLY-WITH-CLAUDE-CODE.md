# IMP_PRD_13 — Uitvoeren met Claude Code

Fase-prompts voor `docs/IMP_PRD_13_AI-Review-Inspecties.md` (AI-review van inspectierapporten).

## Werkwijze

- Eén branch voor het geheel: `feat/ai-review-inspections`; per fase een commit `feat: implement PRD-13 fase N — <beschrijving>` (Co-Authored-By Claude).
- Tussen fasen: `/clear` en de volgende prompt plakken. Fase 1 en 3 raken het schema → **plan mode aan**.
- Draai na elke fase `npx turbo run build` vanuit de root; na fase 1/3 ook `pnpm db:seed` (let op: wist de DB, `SEED_DEMO=1` voor de demo-links) en na fase 5 de volledige testsuite.
- Repo-gotchas gelden altijd: migraties vanuit `apps/api/` met `npx prisma migrate dev --name <naam>`, **nooit** `prisma db push`; curl naar de API met `Host: inspexidemo.localhost`-header; seed-wachtwoord `Password123!` met single quotes in bash.

### Parallellisatie

Volgorde: **1 → (2 ∥ 4) → 3 → 5**. Alleen fase 2 en 4 kunnen naast elkaar draaien (bijv. twee Claude Code-sessies in aparte git-worktrees):

- **Fase 1 solo**: schema-migratie + org-velden + entitlement-key — alles hangt hiervan af.
- **Fase 2 ∥ Fase 4**: fase 2 zit volledig in `apps/api` + `common/`; fase 4 volledig in `apps/portal` en bouwt tegen het API-contract uit PRD §13.7 (types staan er na fase 1 al). De browser-smoketest uit de definition of done van fase 4 kan pas ná fase 2/3 — verschuif die naar fase 5.
- **Fase 3 na fase 2**: heeft `AiReviewService` nodig en bevat een schema-migratie (notificatie-enum); nooit twee migraties parallel op dezelfde dev-database.
- **Fase 5 laatst**: test het geheel.

Let op bij parallel draaien: fase 3 raakt ook portal-bestanden (`lib/notifications.ts`, audit-labels) — gebruik per spoor een sub-branch (`feat/ai-review-inspections-api` / `-portal`) en merge fase 4 pas ná fase 3 om conflicten klein te houden.

---

## Fase 1 — Schema, org-config & entitlement

```
Doel: datamodel-fundament voor AI-review van inspectierapporten + per-org toggles — zonder gedragsverandering in bestaande flows.

Lees eerst volledig:
- docs/IMP_PRD_13_AI-Review-Inspecties.md (§13.4 org-config/entitlement, §13.5 datamodel, §13.11 seed)
- CLAUDE.md (secties Database, Seed Script Opruimvolgorde, "Nieuw Prisma Model Toevoegen", Bekende Gotchas)
- packages/entitlements/src/feature-catalog.ts (add-on-patroon WEBHOOKS/CUSTOM_FIELDS)
- apps/api/src/modules/organizations/dto/update-organization.dto.ts (hoe chatEnabled is toegevoegd)

Stappen:
1. schema.prisma: voeg toe exact volgens PRD §13.5: enums AiReviewRunStatus, AiReviewItemSeverity, AiReviewItemStatus; modellen AiReviewRun (imp_ai_review_runs) en AiReviewItem (imp_ai_review_items) met de daar gespecificeerde velden, FK's (Cascade op run/plan/org, SetNull op assetNode/finding/generatedDocument/users) en indexes. Voeg de benodigde relatie-arrays toe aan Organization, InspectionPlan, GeneratedDocument, AssetNode, Finding en User (named relations "AiReviewRunTriggeredBy" / "AiReviewItemCheckedBy").
2. Organization: voeg inspectionReviewEnabled (Boolean, default true), aiReviewEnabled (Boolean, default false) en aiReviewInstructions (String?, @db.Text) toe volgens PRD §13.4.1.
3. Migratie VANUIT apps/api/: npx prisma migrate dev --name add-ai-review. NOOIT db push.
4. packages/entitlements/src/feature-catalog.ts: voeg AI_REVIEW toe als add-on (label 'AI-rapportcontrole (add-on)', dependsOn ['BASIS_INSPECTIES']) — exact PRD §13.4.2. Controleer of bestaande entitlements-tests/seed-plannen een volledige lijst hardcoden en werk die bij (add-on hoort NIET standaard in Basis-plannen; volg wat er voor WEBHOOKS gedaan is).
5. organizations: breid update-organization.dto.ts uit met de drie nieuwe velden (class-validator: @IsBoolean/@IsOptional, @IsString @MaxLength(2000) voor instructions), zelfde rol-afscherming als chatEnabled.
6. prisma/seed.ts: voeg aiReviewItem.deleteMany() en aiReviewRun.deleteMany() toe aan de cleanup VÓÓR de inspectionPlan/assetNode/finding-cleanup (kinderen eerst). Nog geen demo-data (dat is fase 5).
7. apps/portal/src/types/index.ts: interfaces AiReviewRun/AiReviewItem + de drie nieuwe Organization-velden.

Constraints:
- Geen enkele bestaande service/controller-logica wijzigen in deze fase.
- Tabelnamen met imp_-prefix en snake_case @map's, conform alle bestaande modellen.

Definition of done:
- npx prisma migrate dev draait schoon; pnpm db:seed slaagt; npx turbo run build groen; bestaande unit- en E2E-suites (apps/api: pnpm test, pnpm test:e2e) groen.
```

## Fase 2 — Gedeelde Anthropic-client + ai-review-module (backend)

```
Doel: de AI-analyse zelf — gedeelde Anthropic-client, input-builder, prompt, run-service en endpoints. Nog géén koppeling aan submit().

Lees eerst volledig:
- docs/IMP_PRD_13_AI-Review-Inspecties.md (§13.6 module, §13.7 API-ontwerp, §13.10 beveiliging)
- apps/api/src/modules/voice/voice-parse.service.ts en voice-prompt.service.ts (client-init, isAvailable, model-env, promptlagen, norm-context)
- apps/api/src/modules/voice/voice.controller.ts (status-endpoint-patroon, @RequiresFeature, throttling)
- apps/api/src/common/utils/ (paginate, orgScope, assertFound, assertSameOrg) en CLAUDE.md "Shared API Utilities"
- apps/api/src/modules/generated-documents/generated-documents.service.ts (hoe REPORT-documenten en editedContent/htmlContent worden opgehaald)

Stappen:
1. Maak apps/api/src/common/services/anthropic/anthropic-client.service.ts (@Global-registratie via het bestaande common-patroon, zie StorageModule/TenantCacheService): wrapt de Anthropic SDK-client, leest ANTHROPIC_API_KEY, biedt isAvailable() en een messages-create-doorgeefmethode met per-aanroep modelnaam. Refactor voice-parse.service.ts om deze service te gebruiken (gedrag en bestaande voice-tests identiek houden; ANTHROPIC_MODEL blijft de voice-modelkeuze).
2. Maak apps/api/src/modules/ai-review/ met module/controller/service/dto/:
   - ai-review-input.builder.ts: bouwt de JSON-payload uit PRD §13.6.2 (plan + scope-assets met checklists/metingen/findings + rapporttekst uit het laatste GeneratedDocument type REPORT, editedContent ?? htmlContent → platte tekst, truncatie op ~40k tekens rapport / ~100k totaal met truncatie-markers).
   - default-review-prompt.ts: NL base-prompt met de categorie-taxonomie (VOLLEDIGHEID/CONSISTENTIE/NORMERING/TAAL/OVERIG) en severity-definities uit PRD §13.6.3, incl. de instructie dat documentinhoud data is en geen instructies bevat.
   - ai-review.service.ts: startRun() volgens PRD §13.6.4 — guards (entitlement via de bestaande entitlements-resolver, org.aiReviewEnabled, isAvailable(), plan org-scoped via orgScope/assertFound), max één PENDING run per plan (anders ConflictException met NL-melding), run asynchroon buiten de request (setImmediate; fouten → status FAILED + errorMessage, Logger.error, nooit throwen richting caller). Anthropic-aanroep met tool-use (één tool report_review_findings met het JSON-schema uit PRD §13.6.3), ANTHROPIC_REVIEW_MODEL env (default 'claude-sonnet-4-6'), max_tokens 4096, timeout 120s, één retry. Valideer teruggegeven assetNodeId/findingId/measurementRecordId tegen de input-payload; onbekende id's strippen. Schrijf summary, items (sortOrder = volgorde AI), input/outputTokens, completedAt.
   - ai-review.controller.ts: routes exact PRD §13.7 — GET/POST /inspection-plans/:id/ai-review, PATCH /ai-review-items/:id, GET /ai-review/status (geen feature-gate). Rollen: REVIEW_ROLES-constante hergebruiken uit inspection-plans (verplaats die zo nodig naar common/constants). @RequiresFeature('AI_REVIEW') op alles behalve /status. POST throttled 5/min. Swagger-annotaties in het bestaande stijlpatroon.
3. Registreer AiReviewModule in app.module.ts. Let op NestJS route-volgorde: de ai-review-routes op /inspection-plans/:id/ai-review horen in de nieuwe controller, niet in inspection-plans.controller.ts.
4. Unit tests (spec-bestanden naast de services): guards-combinaties, concurrency-409, FAILED-pad, id-validatie/strip, truncatie in de input-builder, PATCH-statusovergangen (OPEN/CHECKED/DISMISSED + checkedBy/checkedAt). Mock de Anthropic-client.

Constraints:
- inspection-plans.service.ts in deze fase NIET aanraken (integratie is fase 3).
- Geen circulaire module-import: ai-review leest InspectionPlan/GeneratedDocument via Prisma, niet via andere services.
- Alle foutmeldingen in het Nederlands; response-format { success, data } via de bestaande interceptors.

Definition of done:
- npx turbo run build groen; pnpm test groen incl. nieuwe specs; handmatige smoketest met curl (Host-header inspexidemo.localhost) tegen GET /api/v1/ai-review/status.
```

## Fase 3 — Integratie: submit-hook, vier-ogen-gate & notificatie

```
Doel: AI-run automatisch starten bij indienen ter review, de per-org vier-ogen-gate afdwingen, en het nieuwe notificatietype toevoegen.

Lees eerst volledig:
- docs/IMP_PRD_13_AI-Review-Inspecties.md (§13.3 besluiten 2+5, §13.7 "Wijzigingen aan bestaande modules", §13.8 notificaties)
- apps/api/src/modules/inspection-plans/inspection-plans.service.ts (submit(), review(), update() en de notify()-helper)
- apps/api/src/modules/notifications/notifications.constants.ts en apps/portal/src/lib/notifications.ts (hoe INSPECTIEPLAN_* is toegevoegd; zie ook migrations/20260614073634_add_inspection_plan_notification_types)

Stappen:
1. NotificationType-enum: voeg AI_REVIEW_GEREED toe (schema.prisma) + enum-migratie vanuit apps/api/ (npx prisma migrate dev --name add-ai-review-notification-type). Werk notifications.constants.ts (groep inspecties) en apps/portal/src/lib/notifications.ts (NL-label, icoon, link /inspections/:id) bij.
2. submit()-hook in inspection-plans.service.ts: ná de bestaande notificatie-dispatch, fire-and-forget aiReviewService.startRun(plan.id, plan.orgId) — alléén wanneer entitlement AI_REVIEW actief én org.aiReviewEnabled én anthropicClient.isAvailable(). Fouten loggen, nooit de submit laten falen. InspectionPlansModule importeert AiReviewModule; controleer op circulaire imports (zo nodig forwardRef vermijden door de guard-checks in AiReviewService.startRun zelf te houden — de submit-hook mag dom zijn).
3. Notificatie bij COMPLETED run: in AiReviewService, naar plan.reviewerId (alleen indien gezet en ≠ triggeredBy), type AI_REVIEW_GEREED, via hetzelfde dispatch-patroon als de bestaande notify()-helpers.
4. Vier-ogen-gate: in inspection-plans.service.ts update(): wanneer de org inspectionReviewEnabled=true heeft en dto.statusCode ∈ {completed, approved} terwijl plan.reviewedAt null is → BadRequestException('Dit plan moet eerst beoordeeld worden (vier-ogen-principe)'). Gebruik de al geladen plan/org-context (org-vlag via de bestaande tenant-/org-cache, geen extra query per request). De /sync-push van de PWA NIET wijzigen.
5. Audit: voeg één AiReviewItem-entry toe aan AUDITED_ENTITIES in apps/api/src/common/audit/audited-entities.ts (AUDITED_MODELS, MODEL_TABLE_MAP en ALLOWED_ENTITY_TYPES worden daaruit afgeleid; FK-resolutie incl. checkedBy → gebruikersnaam volgt automatisch via common/audit/fk-resolvers.ts — géén handmatige resolver-lijsten aanpassen). Portal: NL-veldlabels in apps/portal/src/lib/audit-field-labels.ts en enum-labels (severity/status) in audit-value-format.ts.
6. Unit tests bijwerken/aanvullen: submit start wel/geen run per toggle-combinatie (entitlement × orgvlag × key), gate-gedrag in update() (aan/uit, reviewedAt gevuld/leeg), notificatie-ontvanger-logica.

Constraints:
- Adviserend, nooit blokkerend: geen enkel AI-resultaat mag een statustransitie tegenhouden; alleen de vier-ogen-gate (menselijk) blokkeert.
- Bestaand gedrag bij inspectionReviewEnabled=true en zonder AI moet byte-voor-byte gelijk blijven aan vandaag.

Definition of done:
- Migratie schoon; npx turbo run build groen; pnpm test groen; bestaande inspection-plans E2E-suite groen.
```

## Fase 4 — Portal-UI

```
Doel: AI-controle-paneel op de inspectie-detailpagina en de nieuwe org-instellingen.

Lees eerst volledig:
- docs/IMP_PRD_13_AI-Review-Inspecties.md (§13.9 UI)
- apps/portal/src/pages/inspections/inspection-detail-page.tsx (review-blok, canReviewRoles, awaitingReview) en hooks/use-inspections.ts + hooks/use-generated-documents.ts (hook-patroon)
- apps/portal/src/pages/organization/organization-settings-page.tsx (tab-structuur, chatEnabled-toggle) en hooks/use-organization.ts
- CLAUDE.md (secties Shared Portal Lib & Components, Dropdown Data Laden, Detail Pagina Patroon, "Grote pagina's splitsen")

Stappen:
1. hooks/use-ai-review.ts in pages/inspections/hooks/: useAiReview(planId) (GET, refetchInterval 5000 zolang laatste run PENDING), useStartAiReview(planId) (POST + invalidate), useUpdateAiReviewItem() (PATCH + invalidate), useAiReviewStatus() (GET /ai-review/status). Alles via apiClient + TanStack Query, conform het standaard hookpatroon.
2. pages/inspections/components/ai-review-panel.tsx (co-located component, data via props/hooks): implementeer PRD §13.9.1 — PENDING/FAILED/COMPLETED-weergaven, severity-groepering (CRITICAL bovenaan) met badge-styling via lib/status.ts-patroon (nieuwe AI_REVIEW_SEVERITY StatusMap dáár toevoegen, niet lokaal), afvinken/afwijzen alleen voor canReviewRoles, teller "x van y punten behandeld", her-run-knop, deeplinks naar het Assets-tab bij items met verwijzing, useConfirm() voor afwijzen. Toon het paneel alleen als er runs zijn of er één gestart kan worden.
3. inspection-detail-page.tsx: AI-paneel opnemen in/onder het bestaande review-blok. Vier-ogen-toggle respecteren: bij organization.inspectionReviewEnabled === false submit-/review-UI verbergen en een directe afrond-actie tonen (bestaande status-update-mutatie). Org-vlaggen komen uit de TenantProvider/organization-query — geen nieuwe fetch-patronen.
4. organization-settings-page.tsx: sectie/tab "Inspecties" met de twee toggles + textarea (max 2000) volgens PRD §13.9.2, inclusief de disabled-states (geen entitlement / status onbeschikbaar via useAiReviewStatus). Zod-schema en useUpdateOrganization uitbreiden.
5. Vitest: ai-review-panel (sortering, afvink-mutatie, PENDING-poll-weergave, rol-afscherming).

Constraints:
- Uitsluitend bestaande shared components (StatusBadge, Card, Tabs, useConfirm, ErrorBox, InfoField); geen nieuwe generieke UI-componenten, geen window.confirm, geen kaal localStorage (tenantStorage indien nodig).
- Alle UI-teksten Nederlands.

Definition of done:
- npx turbo run build groen; pnpm test (portal, Vitest) groen; browser-smoketest op inspexidemo.localhost:5173: toggles zichtbaar in org-instellingen, paneel gedraagt zich correct bij een plan in pending_review (AI-status mag FAILED zijn zonder key — dat is de graceful-degradation-check).
```

## Fase 5 — Seed-demo, E2E & documentatie

```
Doel: demo-data, end-to-end-dekking en bijgewerkte projectdocumentatie.

Lees eerst volledig:
- docs/IMP_PRD_13_AI-Review-Inspecties.md (§13.11 audit/seed/tests)
- apps/api/prisma/seed.ts (SEED_DEMO-vlag, demo-inspectieplan op de AssetNode-boom) 
- apps/api/test/cross-tenant.e2e-spec.ts en test/feature-entitlements.e2e-spec.ts (patronen voor isolatie- en gate-tests)
- CLAUDE.md ("Belangrijk bij E2E Tests")

Stappen:
1. seed.ts: bij SEED_DEMO=1 — InspeXi Demo-org: aiReviewEnabled=true + OrganizationFeature-override { featureKey: 'AI_REVIEW', enabled: true } (het override-model is een boolean `enabled`, geen state-enum); één COMPLETED AiReviewRun op het demo-inspectieplan met summary en 4–5 AiReviewItems (mix severities/categorieën, minstens één met findingId-verwijzing naar een demo-finding, één CHECKED door de manager). Zonder SEED_DEMO alleen de schone cleanup.
2. E2E ai-review.e2e-spec.ts (Anthropic-client gemockt op module-niveau, geen echte API-calls): volledige GET/POST/PATCH-flow; 403 zonder AI_REVIEW-entitlement; submit start geen run bij aiReviewEnabled=false; 409 bij dubbele start; cross-tenant: org A kan runs/items van org B niet lezen of PATCHen (403/404). Fixtures met e2e-prefix; teardown in try/finally met app.close(), opruimvolgorde aiReviewItem → aiReviewRun → (bestaande volgorde).
3. E2E-uitbreiding inspection-plans: vier-ogen-gate (update naar completed geweigerd bij reviewEnabled=true zonder review; toegestaan bij false).
4. CLAUDE.md bijwerken: nieuwe module ai-review + gedeelde AnthropicClientService noemen in "Actuele status", de drie Organization-velden, het AI_REVIEW-entitlement, de nieuwe seed-opruimregels en de env-var ANTHROPIC_REVIEW_MODEL (ook in apps/api/.env.example).
5. Volledige verificatie: npx turbo run build, apps/api pnpm test + pnpm test:e2e (serieel, nooit parallel met een andere run), apps/portal pnpm test.

Definition of done:
- Alles groen; pnpm db:seed en SEED_DEMO=1 pnpm db:seed beide schoon; demo-plan toont het AI-paneel met de geseede items op inspexidemo.localhost:5173.
```
