# Toepassen in de repo met Claude Code — balans + prompts

Dit document maakt de balans op van het integratie-ontwerp (Fase 1 + 2) en geeft kant-en-klare prompts om het met **Claude Code** in de `InspeXi-Beheer`-repo toe te passen.

---

## 1. Balans — wat ligt er klaar

### Vastgestelde keuzes (leidend voor alles)
- **CRM**: hergebruik Beheer's `Contact`/`Location`; App's `Client` wordt niet geïmporteerd.
- **Data**: geen migratie — schema + functionaliteit porten, verse seed.
- **Client-portal**: aparte 4e app (Fase 6).
- **Zware features**: document-generatie (Fase 4) + voice (Fase 7) in scope, later.
- **Status/type-lijsten**: 11 per-org overschrijfbare **lookup-tabellen**; `NormTypeDefinition` ook lookup; overige (lifecycle/structureel) blijven Prisma-enums.
- **Soft-delete inspectiedomein**: `deletedAt` (sync-tombstone), niet `isDeleted`.
- **Tenant**: `orgId` gedenormaliseerd op uitvoeringstabellen; App-rollen mappen 1-op-1 op de bestaande `Role`-enum.

### Opgeleverde artefacten
| Pad | Inhoud |
|---|---|
| `docs/INTEGRATIE-INSPEXI-APP.md` | Master-plan, 8 fases, open punten |
| `docs/fase1/inspection-domain.prisma` | Paste-ready Prisma-fragment (61 modellen, 22 enums, 11 lookups) |
| `docs/fase1/FASE1-SCHEMA.md` | Edits op bestaande modellen, enum/lookup-keuzes, seed-volgorde, audit, migratie, checklist |
| `docs/fase2/FASE2-API.md` | API-porting-gids: volgorde, conventies, per-module checklist |
| `docs/fase2/code/storage/` | `R2StorageProvider` + env-schakelbare `StorageModule` |
| `docs/fase2/code/lookups/` | `LookupService`/controller/module + DTO's (11 lookups) |
| `docs/fase2/code/seed/seed-lookups.ts` | 11 lookup-systeemdefaults (NL labels + kleuren) |
| `docs/fase2/code/inspection-plans/` | Golden-path **uitvoering** (volledig) |
| `docs/fase2/code/asset-types/` | Golden-path **config** (`/merged`, velden, constraints, validate-parent, duplicate) |
| `docs/fase2/code/assets/` | Geporte module: boom, reorder/move, X-Device-ID, statusCode-lookup |
| `docs/fase2/code/findings/` | Geporte module: statusCode-lookup + resolutie, classificatie, foto's |

### Verificatiestatus
- ✅ Prisma **relatie-integriteit** statisch geverifieerd (alle named relations gepaird, geen dubbele/ontbrekende).
- ✅ Alle 23 referentie-`.ts`-bestanden **transpile-clean** (syntax).
- ⏳ **Niet** geverifieerd (kan pas ná de migratie in de repo): volledige `prisma validate`, `tsc` type-check tegen de gegenereerde client, runtime/E2E.

### Nog te doen (latere fases)
- Fase 2 rest-modules: `norm-types`, `classification-models`, `categories`, `location-types`, `finding-templates`, `checklists`, `measurement-sheet-templates`, `inspection-templates`, `inspection-locations`, `visual-inspections`, `measurement-records`, `measurement-sheet-records`, `location-images`, `standalone-measurements`, `portal-stats`.
- Fase 3 sync · Fase 4 doc-generatie · Fase 5 portal-GUI · Fase 6 client-portal · Fase 7 voice · Fase 8 hardening.

---

## 2. Werkwijze met Claude Code

- Werk **per fase in een aparte sessie**; gebruik `/clear` ertussen zodat de context schoon blijft.
- Gebruik **plan-mode** (Shift+Tab) voor de schema-fase (hoog risico) — laat Claude Code eerst een plan tonen, keur het goed, laat het dan uitvoeren.
- Maak een **integratiebranch**: `git checkout -b feat/inspexi-integratie`.
- **Commit per fase** met het projectpatroon (`feat: ...`, Co-Authored-By Claude).
- Voor onafhankelijk werk (meerdere losse modules): vraag Claude Code expliciet om **subagents** parallel te laten lopen, plus een aparte **verificatie-subagent**.
- Respecteer de repo-gotchas uit `CLAUDE.md`: migraties **vanuit `apps/api/`**, **nooit `db push`**, bouwen met `npx turbo run build`, poorten vrijmaken bij herstart.

De prompts hieronder zijn copy-paste. Elke prompt heeft een **Doel**, **Lees eerst**, **Stappen**, **Constraints** en **Definition of done**.

---

## 3. Prompt A — Fase 1: schema-fundament  (plan-mode aan)

```
Doel: pas Fase 1 (het samengevoegde Prisma-schema voor het inspectiedomein) toe in apps/api.

Lees eerst volledig:
- docs/fase1/FASE1-SCHEMA.md
- docs/fase1/inspection-domain.prisma
- docs/INTEGRATIE-INSPEXI-APP.md (§1-4 voor de context)

Stappen:
1. Voeg de back-relations uit FASE1-SCHEMA.md §2 toe aan de bestaande modellen in
   apps/api/prisma/schema.prisma: Organization, User, Contact, ContactPerson, Project.
2. Plak de inhoud van docs/fase1/inspection-domain.prisma onderaan schema.prisma.
3. Draai `npx prisma format` en `npx prisma validate` (vanuit apps/api/). Los eventuele
   resterende relatie-/typefouten op.
4. Maak de migratie VANUIT apps/api/: `npx prisma migrate dev --name add-inspection-domain`.
   Gebruik NOOIT `db push`.
5. Breid prisma/seed.ts uit: voeg de cleanup-volgorde uit FASE1-SCHEMA.md §5 toe in de
   juiste richting (kinderen eerst), plus de minimale seed-inhoud (norm-types,
   classificatiemodellen, asset-/locatie-types, 1 checklist, 1 meetstaat-template,
   1 inspection-template, 1 demo-inspectieplan met assets+findings, gekoppeld aan een
   bestaand seed-Contact).
6. Registreer de geaudite inspectiemodellen in AUDITED_MODELS + MODEL_TABLE_MAP in
   prisma/prisma.service.ts (lijst in FASE1-SCHEMA.md §6).
7. Update apps/portal/src/types/index.ts met de nieuwe interfaces (alleen de modellen die
   de portal nu nodig heeft; rest mag later).

Constraints:
- Beheer-conventies: id/FK `@db.Uuid`, tenant `orgId @map("org_id")`, tabellen `imp_`,
  inspectiedomein gebruikt `deletedAt` (niet isDeleted).
- App's Client/Project/Location NIET importeren; relaties wijzen naar Beheer Contact/Project.
- App's `Location` is al hernoemd naar `InspectionLocation` — laat dat zo.

Definition of done:
- `npx prisma validate` slaagt; `npx prisma migrate dev` draait schoon op een lege DB
  (test desnoods met `npx prisma migrate reset` op een wegwerp-DB).
- `pnpm db:seed` draait zonder FK-fouten.
- `npx turbo run build` is groen.
- Loop daarna de verificatie-checklist in FASE1-SCHEMA.md §8 af en rapporteer per punt.
- Commit: `feat: add inspection domain schema (Fase 1)`.
```

---

## 4. Prompt B — Fase 2: fundament (storage + lookups + seed)

```
Doel: zet het Fase 2-fundament neer: R2-storage, de lookup-module en de lookup-seed.

Lees eerst: docs/fase2/FASE2-API.md (§3) en de bestanden onder docs/fase2/code/storage,
docs/fase2/code/lookups en docs/fase2/code/seed.

Stappen:
1. Storage: kopieer R2StorageProvider naar src/common/services/storage/r2-storage.provider.ts
   en vervang storage.module.ts door de env-schakelbare versie. Voeg deps toe:
   `pnpm --filter @inspexi/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
   (gebruik de echte package-naam van apps/api). Vul .env.example aan met de STORAGE_*/R2_*-vars.
2. Lookups: maak src/modules/lookups/ met lookup.service.ts, lookup.controller.ts,
   lookup.module.ts en dto/ (uit docs/fase2/code/lookups). Registreer LookupModule in app.module.ts.
3. Seed: kopieer seed-lookups.ts naar prisma/seed-lookups.ts en roep `await seedLookups(prisma)`
   aan in prisma/seed.ts.

Constraints:
- Pas import-paden aan op het @/ alias-patroon van de repo.
- Bevestig dat de 11 LOOKUP_KINDS-delegates exact overeenkomen met de Prisma-modelnamen.

Definition of done:
- `npx turbo run build` groen; `pnpm db:seed` zet de 11 lookup-defaults neer.
- `GET /api/v1/lookups/plan-status-types` (met geldige JWT + Host-header) geeft de defaults;
  een org-override met dezelfde code wint. Test dit met de curl-conventie uit CLAUDE.md.
- Commit: `feat: add R2 storage + lookup module + lookup seed (Fase 2 fundament)`.
```

---

## 5. Prompt C — Fase 2: de 4 referentiemodules in de repo

```
Doel: breng de vier volledig uitgewerkte referentiemodules live in apps/api.

Lees eerst: docs/fase2/FASE2-API.md (§1,5,7) en de mappen onder docs/fase2/code/
voor inspection-plans, asset-types, assets, findings.

Stappen (per module: inspection-plans, asset-types, assets, findings):
1. Maak src/modules/<naam>/ met controller, service, module en dto/ op basis van de
   referentiecode. Splits dto.ts desgewenst in losse bestanden + een index.
2. Registreer elke module in app.module.ts (en onderlinge imports: assets→AssetTypesModule+
   LookupModule; findings→LookupModule; inspection-plans→LookupModule).
3. Schrijf per module een unit-spec (*.service.spec.ts) en een E2E-suite in Beheer-stijl.
4. Breid test/cross-tenant.e2e-spec.ts uit: org A stuurt org B's contactId/assetId/
   templateId in create/update → verwacht 403.

Constraints:
- Houd de Beheer-conventies aan (zie FASE2-API.md §1,5): dunne controllers met
  {success,data}, globale guards, @Roles, paginate/orgScope/assertSameOrg, NL-meldingen.
- Route-volgorde: specifieke routes vóór :id.
- Verifieer de submit/review-logica van inspection-plans tegen de originele Inspexi-App
  service en pas notificaties aan op Beheer's NotificationsService.

Definition of done:
- `npx turbo run build` groen; `pnpm --filter @inspexi/api test` groen (unit);
  E2E + cross-tenant groen.
- Loop de per-module checklist (FASE2-API.md §5) af.
- Commit: `feat: port inspection-plans, asset-types, assets, findings (Fase 2)`.
```

---

## 6. Prompt D — Fase 2: rest-modules met subagents (parallel)

> Verfijnd na A/B/C. Geleerd: Claude Code volgt referentiecode + checklists trouw, maar (1) de
> 4 modules staan nu LIVE in de repo → laat subagents díé als canon gebruiken; (2) parallelle
> subagents mogen NIET tegelijk gedeelde bestanden bewerken (app.module.ts, prisma.service.ts,
> seed.ts, cross-tenant-spec) → de orchestrator doet die edits zelf; (3) laat elke subagent
> zichzelf `tsc --noEmit` + unit-test geven vóór teruggave (dat ving alles in A/B/C af).

```
Doel: port de resterende Fase 2-modules. Fase A/B/C zijn al gemerged.

Canon = de LIVE modules in apps/api/src/modules (NIET docs/fase2/code; dat was de blauwdruk):
- config-patroon (incl. sub-resources): apps/api/src/modules/asset-types  (fields + constraints,
  /merged-overlay, validate-parent, duplicate, assertManageable)
- uitvoering-patroon: apps/api/src/modules/{assets, findings, inspection-plans}
- lookups: apps/api/src/modules/lookups  (LookupService.resolveLookup voor *Code-velden)

Lees per te porten module ook de ORIGINELE bron: ../Inspexi-App/apps/api/src/modules/<naam>
— de live modules dekken de conventies, de bron dekt de business-logica (vooral de
versie-lifecycle: publish/retire/new-version + version-history).

ORCHESTRATIE (cruciaal — voorkom merge-conflicten op gedeelde bestanden):
- Subagents maken UITSLUITEND hun eigen module-map: controller/service/module/dto +
  <naam>.service.spec.ts + test/<naam>.e2e-spec.ts. Ze bewerken GEEN gedeelde bestanden.
- JIJ (orchestrator) doet ALLE edits aan gedeelde bestanden zelf, ná afloop, sequentieel:
  app.module.ts (module-registratie), prisma/prisma.service.ts (AUDITED_MODELS + MODEL_TABLE_MAP),
  prisma/seed.ts (seed-data + cleanup-volgorde kinderen-eerst), test/cross-tenant.e2e-spec.ts
  (extra 403-cases), apps/portal/src/types/index.ts.
- Elke subagent VERIFIEERT zichzelf vóór teruggave en rapporteert het resultaat:
  `npx tsc -p tsconfig.json --noEmit` (in apps/api) én zijn eigen unit-spec via jest, beide groen.

GROEP 1 — parallel (echt onafhankelijk), 1 subagent per module:
  norm-types, classification-models (+characteristics+options), categories,
  location-types (= 1-op-1 kopie van asset-types, incl. validate-parent + fields/constraints).

GROEP 2 — serieel ná groep 1 (FK's naar groep 1 / naar elkaar):
  finding-templates (FK classificationModel + category),
  checklist-items, checklists (+itemLinks +versionHistory; lifecycle CONCEPT/ACTIEF/VERVALLEN +
  publish/retire/new-version),
  measurement-sheet-templates (GLOBAAL: geen orgId, superuser-only; +sections+fields+versionHistory),
  inspection-templates (+checklist/meetstaat-links +versionHistory +fork).

GROEP 3 — uitvoering, serieel (hangen aan plan/asset; kopieer assets/findings):
  inspection-locations (boom = kopie van assets), visual-inspections, measurement-records,
  measurement-sheet-records, location-images (+markers; multipart-upload via STORAGE_PROVIDER),
  standalone-measurements (+values), portal-stats (read-only dashboard, org-scoped).

MODULE-SPECIFIEKE REGELS:
- LookupService ALLEEN waar een *Code-veld bestaat (Fase 1): standalone-measurement-values
  (passFailCode → 'pass-fail-status-types'). De rest gebruikt de BEHOUDEN enums — geen lookup.
  Let op: measurement-sheet-records.status, visual/measurement-records.status,
  template-lifecycle = enums (MeasurementSheetRecordStatus / InspectionExecStatus /
  ChecklistStatus / TemplateStatus / MeasurementSheetTemplateStatus). NIET via lookup.
- Versie-template-modules: neem publish/retire/new-version + version-history over uit de App-bron.
- Sub-resources: gebruik asset-types (fields/constraints) als skelet voor secties/velden/links/markers.
- Notificaties: ontbreekt een NotificationType-waarde, voeg die toe aan de enum + APARTE migratie
  (zoals 20260614073634_add_inspection_plan_notification_types). Doe dit als orchestrator, niet in
  een subagent.
- Behoud sync-velden (syncedAt/deviceId), X-Device-ID op create van veld-entiteiten, en
  expliciete `deletedAt: null`-filters op uitvoeringstabellen.
- Houd PWA-route-namespaces stabiel (asset-types, finding-templates, classification-models,
  measurement-sheet-templates en de uitvoerings-endpoints) — Fase 3 sync hangt eraan.

VERIFICATIE-subagent (afsluitend, ná jouw shared-file edits):
- `npx turbo run build` (root) groen;
- `pnpm --filter <api-pkg> test` (unit) groen;
- `pnpm --filter <api-pkg> test:e2e` tegen een draaiende DB (eerst `docker compose up -d`) groen;
- `npx prisma migrate reset` op een wegwerp-DB → keten + seed herspeelt schoon;
- steekproef: elke service gebruikt orgScope/assertSameOrg en filtert `deletedAt: null` expliciet.

Definition of done: alle modules geregistreerd; build + unit + e2e + cross-tenant groen;
migratie/seed herspeelt schoon. Commit per groep, bv. `feat: port config modules (Fase 2)`
en `feat: port execution modules (Fase 2)`.
```

---

## 7. Prompt E — afsluitende verificatie (los of als subagent)

```
Doel: integrale verificatie van Fase 1+2 vóór merge.

Stappen:
1. `npx turbo run build` (root) — TS + Prisma-client groen.
2. apps/api: `pnpm test` (unit) en `pnpm test:e2e` (serieel) — groen.
3. Controleer Swagger op /api/docs: alle nieuwe tags aanwezig, endpoints onder @ApiBearerAuth.
4. Seed-rooktest: 11 lookup-defaults aanwezig; demo-inspectieplan met assets+findings zichtbaar.
5. Tenant-audit: steekproef dat elke nieuwe service orgScope/assertSameOrg gebruikt en
   `deletedAt: null` expliciet filtert.
6. Schrijf een korte MIGRATIE-NOTITIE in docs/ met wat live staat en wat naar Fase 3-8 schuift.

Definition of done: alles groen, notitie gecommit, branch klaar voor PR.
```

---

## 8. Tips
- Laat Claude Code bij twijfel **eerst de originele App-module lezen** (`../Inspexi-App/apps/api/src/modules/<naam>`) vóór het porten — de referentiecode dekt de conventies, de bron dekt de business-logica.
- Houd de open punten uit `docs/INTEGRATIE-INSPEXI-APP.md §11` in beeld; punt 5 (offerte/aanvraag → automatisch inspectieplan) is een apart ontwerp, geen kopieerwerk.
- Eén PR per fase houdt de review behapbaar.
