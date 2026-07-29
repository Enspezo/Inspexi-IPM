# IMP_PRD_14 — Uitvoeren met Claude Code

Fase-prompts voor `docs/IMP_PRD_14_Online-Herstel.md` (online herstel van constateringen door externen & klanten).

## Werkwijze

- Eén branch voor het geheel: `feat/online-repair`; per fase een commit `feat: implement PRD-14 fase N — <beschrijving>` (Co-Authored-By Claude).
- Tussen fasen: `/clear` en de volgende prompt plakken. Fase 1 en 3 raken het schema → **plan mode aan**.
- Draai na elke fase `npx turbo run build` vanuit de root; na fase 1/3 ook `SEED_DEMO=1 pnpm db:seed` (let op: wist de DB incl. users → opnieuw inloggen; bij stale tenant-cache de API herstarten) en na fase 6 de volledige testsuite.
- Repo-gotchas gelden altijd: migraties vanuit `apps/api/` met `npx prisma migrate dev --name <naam>`, **nooit** `prisma db push`; curl naar de API met `Host: inspexidemo.localhost`-header; seed-wachtwoord `Password123!` met single quotes in bash; client-portal draait op :5174.

### Parallellisatie

Volgorde: **1 → 2 → 3 → (4 ∥ 5) → 6**:

- **Fase 1 solo**: schema-fundament — alles hangt hiervan af.
- **Fase 2 na 1**: de sessie-/claim-backend is de kern; fase 3 bouwt erop voort (verklaring hangt aan sessies).
- **Fase 3 na 2**: bevat een enum-migratie (notificatietypes) — nooit twee migraties parallel op dezelfde dev-database.
- **Fase 4 ∥ Fase 5**: fase 4 zit volledig in `apps/client-portal`, fase 5 volledig in `apps/portal`; beide bouwen tegen het API-contract uit PRD §14.6/§14.10. Bij parallel draaien (aparte git-worktrees): sub-branches `feat/online-repair-client` / `-portal`, merge in die volgorde.
- **Fase 6 laatst**: test het geheel.

---

## Fase 1 — Schema, entitlement & isCritical-fundament

```
Doel: datamodel-fundament voor online herstel — zonder gedragsverandering in bestaande flows.

Lees eerst volledig:
- docs/IMP_PRD_14_Online-Herstel.md (§14.4 configuratie/entitlement, §14.5 datamodel)
- CLAUDE.md (secties Database, Seed Script Opruimvolgorde, "Nieuw Prisma Model Toevoegen", Bekende Gotchas)
- packages/entitlements/src/feature-catalog.ts (add-on-patroon WEBHOOKS)
- apps/api/prisma/schema.prisma: de modellen ClientMagicLink, FindingResolution, ClassificationOption, Finding, InspectionPlan, ResolutionStatusType, SignerRoleOption en enum DocumentType
- apps/api/prisma/seed.ts (waar de system-lookup-rows en de cleanup-volgorde staan)

Stappen:
1. schema.prisma, exact volgens PRD §14.5: enums RepairAccessType en RepairSessionStatus; model RepairSession (imp_repair_sessions) met alle daar gespecificeerde velden, FK's (Cascade op org/plan, SetNull op clientUser/generatedDocument), token @unique en index. Relatie-arrays toevoegen aan Organization, InspectionPlan, ClientUser en GeneratedDocument.
2. FindingResolution: veld repairSessionId (String?, @db.Uuid, FK → RepairSession, onDelete: SetNull) + relatie (RepairSession.resolutions).
3. ClassificationOption.isCritical en Finding.isCritical (beide Boolean @default(false)) + index @@index([inspectionPlanId, isCritical, statusCode]) op Finding.
4. Organization.onlineRepairDefault (Boolean @default(false)); InspectionPlan.onlineRepairEnabled (Boolean @default(false)) en criticalRepairNotifiedAt (DateTime?).
5. enum DocumentType: waarde HERSTELVERKLARING toevoegen.
6. Migratie VANUIT apps/api/: npx prisma migrate dev --name add-online-repair. NOOIT db push.
7. packages/entitlements/src/feature-catalog.ts: ONLINE_HERSTEL toevoegen als add-on, exact PRD §14.4.1. Controleer of entitlements-tests/seed-plannen een volledige featurelijst hardcoden en werk die bij (volg wat er voor WEBHOOKS gedaan is; add-on hoort NIET in Basis-plannen).
8. seed.ts: (a) cleanup: repairSession.deleteMany() toevoegen NÁ findingResolutionPhoto/findingResolution en VÓÓR generatedDocument/clientUser/inspectionPlan — controleer de werkelijke bestaande volgorde en plaats de regel zo dat alle FK's kloppen; (b) system-lookup-rows: ResolutionStatusType-rows REPORTED ('Hersteld gemeld') en CONFLICT ('Conflict — niet doorgevoerd') en SignerRoleOption-row HERSTELLER ('Hersteller'), isSystem: true, naast de bestaande rows (altijd, niet alleen bij SEED_DEMO).
9. DTO's: UpdateOrganizationDto → onlineRepairDefault (@IsBoolean @IsOptional, zelfde rol-afscherming als chatEnabled); update-DTO van inspection-plans → onlineRepairEnabled (@IsBoolean @IsOptional) — alléén het DTO-veld, de validatielogica komt in fase 2.
10. Backfill-script apps/api/scripts/backfill-finding-is-critical.ts (ts-node): zet Finding.isCritical o.b.v. classificationValues × ClassificationOption.isCritical per classificatiemodel. Omdat er nu nog geen opties als kritiek gemarkeerd zijn is de uitkomst een no-op — het script is er voor orgs die later opties markeren (her-runbaar, idempotent). Documenteer het gebruik in een comment.
11. Types: apps/portal/src/types/index.ts en de client-portal-types → RepairSession, RepairAccessType, RepairSessionStatus, de nieuwe Organization/InspectionPlan/Finding/ClassificationOption-velden en het nieuwe DocumentType.

Constraints:
- Geen enkele bestaande service/controller-logica wijzigen in deze fase (DTO-velden toevoegen mag, gebruiken nog niet).
- Tabelnamen imp_-prefix en snake_case @map's, conform alle bestaande modellen.

Definition of done:
- npx prisma migrate dev draait schoon; pnpm db:seed en SEED_DEMO=1 pnpm db:seed slagen; npx turbo run build groen; bestaande unit- en E2E-suites (apps/api: pnpm test, pnpm test:e2e) groen.
```

## Fase 2 — Backend: sessies, claim-flow & isCritical-onderhoud

```
Doel: de client-repair-module — lookup, sessies, guard, claim-transactie met first-wins-concurrency, foto's en de plan-samenvatting. Nog géén herstelverklaring/e-mails/notificaties (fase 3).

Lees eerst volledig:
- docs/IMP_PRD_14_Online-Herstel.md (§14.3 besluiten, §14.6 API-ontwerp, §14.11 beveiliging)
- apps/api/src/modules/client-findings/ (controller/service: resolve+photos-patroon, MimeTypeValidator, storage, assertInspectionAccess-gebruik)
- apps/api/src/modules/client-auth/client-auth.service.ts (magic-link-token-patroon, throttling) en common/guards/client-jwt-auth.guard.ts (guard-patroon)
- apps/api/src/common/utils/resolve-inspector-contact.ts en common/utils/ (orgScope, assertFound, assertSameOrg)
- apps/api/src/modules/findings/findings.service.ts (statusCode-flip naar 'resolved' + resolvedAt)
- apps/api/src/modules/generated-documents/generated-documents.service.ts (severity-key-detectie CLASSIFICATIE/RISICO/SEVERITY/PRIORITEIT, regel ~839)
- apps/api/src/modules/sync/ (waar findings uit de PWA-push gemapt worden)

Stappen:
1. Gedeelde severity-helper: extraheer de severity-key-detectie uit generated-documents.service.ts naar apps/api/src/common/utils/classification-severity.ts (pure functie(s): severity-characteristic vinden + optioncode/label/kleur resolven) en laat generated-documents die gebruiken (gedrag identiek, bestaande tests groen).
2. isCritical-onderhoud: in findings.service.ts (create/update) en in de sync-findings-mapper: bereken Finding.isCritical uit classificationValues × de isCritical-vlaggen van de ClassificationOptions van het classificatiemodel (via template/normtype van het plan; cache de optie-lookup per request). Heropen-reset: wanneer een finding met isCritical=true van 'resolved' terug naar een open status gaat → InspectionPlan.criticalRepairNotifiedAt = null.
3. inspection-plans.service.ts: (a) create(): onlineRepairEnabled zetten vanuit organization.onlineRepairDefault, alleen als het ONLINE_HERSTEL-entitlement actief is; (b) update(): bij onlineRepairEnabled true→ zetten valideren dat referenceNumber gevuld is én uniek binnen de org (count op orgId+referenceNumber, case-insensitief getrimd) → anders BadRequestException('Online herstel vereist een uniek rapportnummer (referentienummer) — vul dit eerst in.').
4. Nieuwe module apps/api/src/modules/client-repair/ (module/controller/service/guard/dto/):
   - repair-session.guard.ts: leest Bearer-token, valideert RepairSession (bestaat, status ACTIVE, expiresAt in de toekomst, orgId matcht subdomein-tenant), zet de sessie op request, update lastActivityAt (fire-and-forget). 401 met NL-melding bij verlopen sessie (PRD §14.11).
   - client-repair.service.ts + controller: alle routes exact PRD §14.6 —
     * POST /client/repair/lookup (@Public, @Throttle 5/60s): normaliseer input (trim, postcode uppercase zonder spaties), zoek plan op orgId + referenceNumber (case-insensitief) + onlineRepairEnabled + postcode-match (addressPostalCode, fallback gekoppelde Location.postalCode); elke mislukking → dezelfde generieke NotFoundException-melding uit PRD §14.3 besluit 11 + Logger.warn met IP. Succes → RepairSession (ANONYMOUS, token 48 bytes crypto-random hex, expiresAt +72u, createdIpAddress) + token + sessieoverzicht.
     * POST /client/repair/sessions (ClientJwtAuthGuard): assertInspectionAccess-patroon uit client-findings hergebruiken; sessie CLIENT_USER met contactName/email vooraf gevuld vanuit de ClientUser.
     * GET /client/repair/session: planinfo (adres-velden, inspectiedatum, inspecteur-contact via resolveInspectorContact met de org-instellingen), samenvatting per severity-groep (gedeelde helper uit stap 1: per ClassificationOption-groep {label, kleur, isCritical, aantalOpen, aantalOpgelost}), constateringenlijst met volgnummer (sortering createdAt asc, id asc), foto's (finding- én resolutiefoto-ids), herstelstatus en — indien hersteld — de werkzaamheden-omschrijving en foto's ZONDER herstellergegevens. Eigen sessie-claims gemarkeerd (isMine).
     * POST /client/repair/findings/:id/resolve: de claim-transactie exact volgens PRD §14.6 (atomische updateMany op statusCode 'open' → REPORTED-resolution; verloren race → CONFLICT-resolution + 409 met de NL-melding uit het PRD). Kritiek-check na succesvolle claim (fire-and-forget): geen open isCritical-findings meer + criticalRepairNotifiedAt null → timestamp atomisch zetten; de notificatie/e-mail zelf komt in fase 3 — bouw een injecteerbare hook (bijv. een RepairEventsService met no-op dispatch) zodat fase 3 alleen de dispatch invult.
     * POST /client/repair/findings/:id/resolve/photos + GET /client/repair/photos/:id: hergebruik het patroon (validators, storage, streaming) uit client-findings; scope: alleen resoluties van de eigen sessie resp. foto's binnen het plan van de sessie.
   - Alle routes @RequiresFeature('ONLINE_HERSTEL'); org via @CurrentTenant; DTO's met class-validator en NL-meldingen.
5. Registreer ClientRepairModule in app.module.ts. Geen circulaire imports: client-repair leest plannen/findings via Prisma, niet via andere feature-services.
6. Unit tests: claim win/verlies/zelfde-sessie-dubbelclaim, kritiek-check eenmaligheid + reset, referenceNumber-validatie (leeg/duplicaat/ok), lookup-normalisatie en generieke fout, guard (verlopen/verkeerde org), isCritical-berekening in findings.service én sync-mapper, samenvatting-groepering. Mock Prisma zoals in bestaande specs.

Constraints:
- Geen wijzigingen aan de bestaande client-findings-flow (PENDING_VERIFICATION blijft intact).
- Complete/sign-endpoints NIET in deze fase (fase 3).
- Alle foutmeldingen Nederlands; response-format { success, data }.

Definition of done:
- npx turbo run build groen; pnpm test groen incl. nieuwe specs; smoketest met curl (Host: inspexidemo.localhost): lookup met het geseede demo-plan faalt netjes generiek zolang onlineRepairEnabled nog uit staat.
```

## Fase 3 — Herstelverklaring, e-mails, notificaties & audit

```
Doel: het afrondproces — herstelverklaring genereren en ondertekenen, bevestigings-/conflict-/herinspectie-e-mails, de drie notificatietypes en audit-registratie.

Lees eerst volledig:
- docs/IMP_PRD_14_Online-Herstel.md (§14.7 herstelverklaring, §14.8 e-mails & notificaties, §14.3 besluit 7 PM-resolutie)
- apps/api/src/modules/generated-documents/generated-documents.service.ts (document aanmaken, requestSignature/signViaRequest, PDF-export) en apps/api/src/modules/client-documents/client-documents.service.ts (sign()-flow, signerRoleCode CLIENT)
- apps/api/src/modules/document-generation/pdf-generation.service.ts en handlebars-setup.ts (render-patroon)
- apps/api/src/modules/notifications/ (dispatch, constants) en apps/api/src/common/services/email.service.ts (Resend-patronen)
- apps/portal/src/lib/notifications.ts en migrations/20260614073634_add_inspection_plan_notification_types (enum-migratie-voorbeeld)

Stappen:
1. NotificationType-enum: HERSTEL_AFGEROND, HERSTEL_CONFLICT, HERINSPECTIE_VOORSTEL toevoegen (schema.prisma) + enum-migratie vanuit apps/api/ (npx prisma migrate dev --name add-repair-notification-types). notifications.constants.ts (groep INSPECTIEPLANNEN) en apps/portal/src/lib/notifications.ts (NL-labels, iconen, link /inspections/:id) bijwerken.
2. resolveProjectManager(plan)-helper in client-repair (plan incl. project geladen): Project.projectManagerId → plan.reviewerId → plan.assignedTo; unit tests voor alle fallbacks.
3. Herstelverklaring-template: apps/api/src/modules/client-repair/templates/herstelverklaring.hbs (of ts-template naast de bestaande handlebars-setup) met de inhoud uit PRD §14.7 — org-branding, plan-gegevens, invuller, genummerde constateringen (volgnummer = zelfde sortering als GET session) met werkzaamheden + fotoraster (foto's als data-URI's of storage-stream-URL's zoals de rapport-rendering dat doet — volg het bestaande patroon), verklaringstekst, handtekeningblok.
4. POST /client/repair/complete: validaties uit PRD §14.6 (eigen REPORTED-resolutions, ≥1 foto per resolution, e-mail verplicht bij ANONYMOUS, naam verplicht) → invullergegevens op de sessie opslaan → GeneratedDocument aanmaken (documentType HERSTELVERKLARING, inspectionPlanId, htmlContent uit de template, status DRAFT) + DocumentSignature (signerRoleCode HERSTELLER, status PENDING) → sessie.generatedDocumentId zetten → { documentId, htmlPreview } terug. Her-aanroep vóór ondertekening regenereert het concept (oude concept-document vervangen, niet stapelen).
5. POST /client/repair/sign: signatureImage → DocumentSignature SIGNED (signedAt, signedIpAddress), GeneratedDocument → SIGNED, PDF renderen en opslaan (pdfUrl, patroon uit generated-documents), sessie → COMPLETED. Daarna fire-and-forget: (a) notificatie HERSTEL_AFGEROND naar de PM; (b) bevestigings-e-mail met PDF (bijlage of downloadlink, volg het bestaande Resend-patroon) naar sessie-e-mail/clientUser.email én naar Contact.email van plan.contactId (leeg → overslaan + Logger.warn).
6. Conflictdispatch invullen (de fase-2-hook): bij een CONFLICT-resolution → notificatie HERSTEL_CONFLICT naar de PM + e-mail naar opdrachtgever en PM met constatering, beide werkzaamheden-omschrijvingen en foto-aantallen naast elkaar (NL-template in email.service of een repair-email-service naar het voorbeeld van planning-email.service.ts).
7. Herinspectie-dispatch invullen: bij de kritiek-trigger uit fase 2 → notificatie HERINSPECTIE_VOORSTEL naar de PM + e-mail naar de opdrachtgever met de vraag uit PRD §14.8.
8. Audit: RepairSession en FindingResolution toevoegen aan AUDITED_ENTITIES in apps/api/src/common/audit/audited-entities.ts (afgeleide registries volgen automatisch). Portal: NL-veldlabels in apps/portal/src/lib/audit-field-labels.ts en enum-labels (RepairAccessType/RepairSessionStatus, resolution-statussen) in audit-value-format.ts.
9. Unit tests: complete-validaties (foto-ontbreekt, vreemde ids, conflict-resolution geselecteerd, e-mail ontbreekt bij anoniem), sign-flow (status-transities, dispatch-ontvangers), conflict- en herinspectie-dispatch (PM-fallbacks, opdrachtgever zonder e-mail).

Constraints:
- Document-ondertekening via de bestaande DocumentSignature-mechanismen — geen parallel handtekeningpad bouwen.
- Alle dispatches fire-and-forget; een falende e-mail mag complete/sign nooit laten falen.
- Bestaand gedrag van generated-documents (PLAN/REPORT) byte-voor-byte gelijk houden.

Definition of done:
- Migratie schoon; npx turbo run build groen; pnpm test groen; handmatige curl-flow (Host-header) van lookup t/m sign werkt tegen het demo-plan met onlineRepairEnabled handmatig aangezet; er verschijnt een HERSTELVERKLARING-document met SIGNED-status en pdfUrl.
```

## Fase 4 — Client-portal UI

```
Doel: de volledige herstel-flow in apps/client-portal — anonieme entry, overzicht, herstelmodal, afronden-wizard en de ingelogde ingang.

Lees eerst volledig:
- docs/IMP_PRD_14_Online-Herstel.md (§14.9 client-portal UI, §14.6 API-contract)
- apps/client-portal/src/pages/inspections/ (findings-tab.tsx, finding-detail-modal.tsx, resolve-finding-modal.tsx, hooks/use-findings.ts — bestaande patronen en PhotoUploader)
- apps/client-portal/src/components/signature-modal.tsx en components/ui (SignatureCanvas, index)
- apps/client-portal/src/App/routes en de auth-provider (waar publieke routes zoals de magic-link-entry staan)
- apps/client-portal/src/components/auth/feature-gate.tsx en lib/features.ts

Stappen:
1. API-laag: lib/repair-api.ts (of hooks-map pages/herstel/hooks/) met het sessietoken als expliciete Bearer-header (NIET de client-JWT): useRepairLookup, useRepairSession (GET, refetch na mutaties), useClaimFinding, useUploadResolutionPhotos, useCompleteRepair, useSignRepair. Token in memory + sessionStorage (herstel binnen de tab); 401 → terug naar /herstel met NL-melding "sessie verlopen".
2. Route /herstel (publiek, buiten de auth-guard, met org-branding zoals de magic-link-pagina): formulier rapportnummer + postcode, generieke foutmelding van de server 1-op-1 tonen, succes → /herstel/overzicht.
3. /herstel/overzicht: kop (adres, inspectiedatum, inspecteur-contact — server levert dit geresolved), samenvattingskaarten per classificatie-groep (label/kleur/isCritical, open vs opgelost), constateringenlijst met volgnummers: open → kaart met foto's + knop "Herstel melden"; hersteld → grijs/gedimd met werkzaamheden + foto's, zonder herstellergegevens; eigen claims badge "Door u gemeld"; conflict van deze sessie → aparte gele melding. Sticky footer-knop "Afronden" (enabled bij ≥1 eigen REPORTED-melding).
4. Herstelmodal: textarea werkzaamheden (verplicht) + PhotoUploader (min 1 — submit disabled zonder foto), volgorde: claim → foto-upload → sessie-refetch. 409 → conflictmelding uit PRD §14.9.3 en de kaart wordt direct grijs.
5. Afronden-wizard (4 stappen, PRD §14.9.4): selectie (conflicten niet selecteerbaar met uitleg; meldingen zonder foto niet selecteerbaar met hint), gegevens (naam verplicht, bedrijf optioneel, e-mail verplicht bij anonieme sessie, vooraf gevuld bij ingelogde), preview (htmlPreview in een iframe/prose-container), ondertekenen (SignatureCanvas) → bevestigingsscherm met PDF-downloadlink.
6. Ingelogde ingang: op de inspectie-detailpagina een sectie "Online herstel" (alleen bij plan.onlineRepairEnabled + feature ONLINE_HERSTEL via de bestaande feature-gate) met knop die POST /client/repair/sessions aanroept en doorstuurt naar /herstel/overzicht.
7. Findings-tab (bestaand): herstelde constateringen grijs weergeven; als ONLINE_HERSTEL + plan.onlineRepairEnabled actief is de "Oplossen"-knop van de oude flow vervangen door een verwijzing naar de herstel-flow (PRD §14.9.6); zonder add-on blijft alles exact zoals nu.
8. Vitest: overzicht (groepering, grijs-weergave, badge, afronden-knop-enablement), herstelmodal (foto-verplichting, 409-pad), wizard-validaties per stap.

Constraints:
- Bestaande UI-componenten van het client-portal hergebruiken (PhotoUploader, SignatureCanvas, kaart/badge-patronen); geen nieuwe generieke componenten zonder noodzaak.
- Alle teksten Nederlands; mobiel bruikbaar (externen staan op de bouwplaats met een telefoon) — enkelkoloms layout, grote tap-targets.
- De oude resolve-finding-flow niet slopen: alleen conditioneel omleiden.

Definition of done:
- npx turbo run build groen; client-portal Vitest groen; browser-smoketest op inspexidemo.localhost:5174: /herstel met het geseede rapportnummer + postcode werkt de hele flow door (claim → foto → afronden → ondertekenen → bevestiging), en een tweede sessie ziet de constatering grijs zonder herstellergegevens.
```

## Fase 5 — Staf-portal UI

```
Doel: beheer en inzicht in apps/portal — org-default, plan-toggle met herstel-URL, herstel/conflict-weergave bij constateringen, isCritical-beheer en het documentlabel.

Lees eerst volledig:
- docs/IMP_PRD_14_Online-Herstel.md (§14.10 staf-portal UI, §14.4 configuratie)
- apps/portal/src/pages/organization/organization-settings-page.tsx (toggle-patroon chatEnabled) en hooks/use-organization.ts
- apps/portal/src/pages/inspections/inspection-detail-page.tsx + de assets/findings-componenten (waar finding-details en resolutions getoond worden)
- het SUPERUSER-classificatiemodellen-scherm (Organisatie → Inspectie-systeem) en de bijbehorende hooks/DTO's
- CLAUDE.md (Shared Portal Lib & Components, Inline Editing Patroon)

Stappen:
1. Org-instellingen: toggle "Online herstel standaard aan voor nieuwe inspecties" (onlineRepairDefault) — disabled + hint "Niet beschikbaar in uw abonnement" zonder ONLINE_HERSTEL-entitlement (entitlement-info via het bestaande features-mechanisme). Zod-schema + useUpdateOrganization uitbreiden.
2. Inspectie-detail (Overzicht): toggle "Online herstel" (onlineRepairEnabled) — de BadRequestException van de server (ontbrekend/niet-uniek rapportnummer) netjes als veldfout tonen; bij actief een infoblok met rapportnummer + kopieerbare herstel-URL https://{slug}.{baseDomain}:5174/herstel (bouw de URL zoals de bestaande cross-domain navigatie in lib/tenant dat doet).
3. Constateringen-weergave (staf): herstelde findings grijs/gedimd met resolutie-detail (werkzaamheden, foto's, datum, bron "Online herstel" en — alleen voor staf — de invullergegevens van de sessie); CONFLICT-resolutions als uitklapbaar blok "Conflict — niet doorgevoerd" met de bewaarde omschrijving en foto's. Data komt mee via de bestaande findings/detail-endpoints — breid de staf-serializer uit met resolutions incl. sessie-invullergegevens (API-wijziging in de bestaande findings/inspections-modules, geen nieuw endpoint).
4. Classificatiemodellen (SUPERUSER, Inspectie-systeem): checkbox "Kritiek" per ClassificationOption (DTO + service-update in de bestaande classificatie-module; let op: wijziging van de vlag werkt alleen door op nieuwe/geüpdatete findings — vermeld het backfill-script apps/api/scripts/backfill-finding-is-critical.ts in de UI-hinttekst).
5. Documenten-tab: label voor documentType HERSTELVERKLARING in de bestaande GeneratedDocument-lijst (status-map/label-map in lib/status.ts of de documenten-component — volg waar PLAN/REPORT gelabeld worden).
6. Types + notificatie-labels controleren (fase 3 voegde ze toe — als fase 5 parallel draait: alleen aanvullen wat ontbreekt, geen conflicten maken).
7. Vitest: plan-toggle (foutafhandeling rapportnummer), conflict-uitklap, isCritical-checkbox.

Constraints:
- Uitsluitend bestaande shared components (StatusBadge, Card, Tabs, InfoField, ErrorBox, useConfirm); geen window.confirm; tenantStorage i.p.v. localStorage.
- Alle UI-teksten Nederlands.

Definition of done:
- npx turbo run build groen; portal Vitest groen; browser-smoketest op inspexidemo.localhost:5173: org-toggle zichtbaar, plan-toggle valideert het rapportnummer, herstelde/conflict-constateringen correct weergegeven, kritiek-checkbox op mijn.localhost:5173 werkt.
```

## Fase 6 — Seed-demo, E2E & documentatie

```
Doel: demo-data, end-to-end-dekking en bijgewerkte projectdocumentatie.

Lees eerst volledig:
- docs/IMP_PRD_14_Online-Herstel.md (§14.12 audit/seed/tests)
- apps/api/prisma/seed.ts (SEED_DEMO-vlag, demo-inspectieplan op de AssetNode-boom, demo-magic-link)
- apps/api/test/cross-tenant.e2e-spec.ts en test/feature-entitlements.e2e-spec.ts (patronen voor isolatie- en gate-tests)
- CLAUDE.md ("Belangrijk bij E2E Tests")

Stappen:
1. seed.ts bij SEED_DEMO=1 — InspeXi Demo-org: OrganizationFeature-override { featureKey: 'ONLINE_HERSTEL', enabled: true } + onlineRepairDefault: true; demo-inspectieplan: referenceNumber 'RAP-2026-001', onlineRepairEnabled: true; één ClassificationOption van het demo-classificatiemodel isCritical: true en één demo-finding die daardoor isCritical: true is (open laten — zo blijft de herinspectie-trigger demo-baar); één afgeronde ANONYMOUS-RepairSession (verlopen expiresAt is prima) met REPORTED-resolution + 1 foto + ondertekende herstelverklaring (GeneratedDocument HERSTELVERKLARING, SIGNED) op een tweede finding. Zonder SEED_DEMO alleen de system-lookup-rows en de schone cleanup.
2. E2E client-repair.e2e-spec.ts (fixtures met e2e-prefix, 127.0.0.1-host, teardown try/finally + app.close(), opruimvolgorde findingResolutionPhoto → findingResolution → repairSession → …): lookup happy path; generieke fout bij fout nummer / foute postcode / feature uit / plan-vlag uit (alle vier dezelfde melding); volledige flow lookup → claim → foto → complete → sign incl. document SIGNED; 409-conflictpad met bewaarde CONFLICT-resolution; complete weigert resolution zonder foto en zonder e-mail bij anoniem; cross-tenant: sessie van org A kan plan/findings/foto's van org B niet bereiken (404); verlopen sessie → 401.
3. E2E-uitbreiding inspection-plans: onlineRepairEnabled aanzetten geweigerd zonder (uniek) referenceNumber; toegestaan mét.
4. E2E-uitbreiding findings: isCritical volgt classificationValues; heropen reset criticalRepairNotifiedAt.
5. CLAUDE.md bijwerken: module client-repair + RepairSession-model in "Actuele status", de nieuwe org/plan-velden, entitlement ONLINE_HERSTEL, DocumentType HERSTELVERKLARING, de drie notificatietypes, de seed-opruimregel en het backfill-script.
6. Volledige verificatie: npx turbo run build; apps/api pnpm test + pnpm test:e2e (serieel, nooit parallel met een andere run); apps/portal en apps/client-portal pnpm test.

Definition of done:
- Alles groen; pnpm db:seed en SEED_DEMO=1 pnpm db:seed beide schoon; op inspexidemo.localhost:5174/herstel logt 'RAP-2026-001' + de demo-postcode direct in en toont één herstelde (grijze) en meerdere open constateringen, incl. de ondertekende herstelverklaring in de documentenlijst.
```
