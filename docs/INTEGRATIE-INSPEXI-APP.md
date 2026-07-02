# Integratieplan — Inspexi-App → InspeXi-Beheer

> Doel: de functionaliteit van de losse **Inspexi-App** repo onderbrengen in de **InspeXi-Beheer** monorepo, zodat alles op **dezelfde database, hetzelfde Prisma-schema en dezelfde GUI-conventies** draait. De **PWA inspectie-app** blijft in een aparte repo en praat via een eigen API-endpoint met dezelfde backend.
>
> Status: voorstel ter review. Opgesteld op basis van een volledige analyse van beide codebases (API-modules, beide portals, PWA-sync, shared package en een model-voor-model schema-diff).

---

## 1. Uitgangspunten (vastgesteld)

Deze keuzes sturen het hele plan:

| # | Onderwerp | Keuze |
|---|---|---|
| 1 | **CRM-model** | **Hergebruik Beheer-CRM.** Inspectieplannen hangen aan bestaande `Contact` (+ `Location`). App's `Client`/`ClientAddress`/`ClientContact` worden **niet** als aparte tabellen overgenomen — ze worden gemapt op `Contact`. |
| 2 | **Datamigratie** | **Geen.** Alleen functionaliteit + schema overnemen. Testdata komt uit een nieuwe seed. Géén ETL, géén `text→uuid` casts op bestaande rijen. |
| 3 | **Client-portal** | **Aparte 4e app** in de monorepo (`apps/client-portal`), eigen client-auth realm, deelt DB/schema/API met Beheer. |
| 4 | **Zware features** | **Beide meenemen**: document-generatie (block-editor templates, Puppeteer-PDF, Word-export) én AI voice-input (Anthropic). |

Gevolg van keuze 1 + 2 samen: dit is in de kern een **schema- en code-port** (greenfield data), niet een datamigratie. Dat verlaagt het risico aanzienlijk — de moeilijkste klassieke merge-problemen (id-casting, kolom-rename op bestaande data, role-remap van bestaande users) vervallen, omdat we de modellen meteen in Beheer-conventie definiëren en vers seeden.

---

## 2. Architectuurverschillen in één oogopslag

| Dimensie | InspeXi-Beheer (doel) | Inspexi-App (bron) | Actie |
|---|---|---|---|
| Tabelprefix | `imp_` op elke tabel | géén prefix | Prefix toevoegen aan alle nieuwe tabellen |
| Primary keys | `uuid @db.Uuid` | `text` | Nieuwe modellen meteen als `uuid` definiëren |
| Tenant-kolom | `orgId` / `org_id` | `organizationId` / `organization_id` | Hernoemen bij overname |
| Multi-tenancy | **Subdomein** (`TenantMiddleware` + `TenantGuard` + `assertSameOrg`) + org-theming | Single-domain, `organizationId` op JWT, scoping per service | Inschuiven in Beheer's subdomein-model |
| Rollen | `roles Role[]` (array, 6 rollen) | `role UserRole` (single, 4 rollen) | 4 App-rollen mappen op bestaande Beheer-rollen |
| Soft-delete | `isDeleted` boolean | `deletedAt` timestamp | Beheer-conventie, mét `deletedAt` waar sync tombstones nodig heeft |
| Audit | Prisma `$use` middleware → `imp_audit_logs` | `audit_log`-tabel bestaat, maar wordt **nooit geschreven** | Beheer's audit-middleware uitbreiden naar inspectiemodellen |
| Response-envelope | `{ success, data }` (consistent) | `{ success, data }` (handmatig, inconsistent) | Uniformeren via Beheer-interceptor |
| Storage | `STORAGE_PROVIDER` interface (Local default, swappable) | concrete Cloudflare R2 (S3-SDK) | R2 als `StorageProvider`-implementatie achter de interface |
| Auth-realms | 1 (`User`) | 2 (`User` + `ClientUser` met eigen JWT) | 2e realm additief overnemen |
| Swagger / rate-limit | aanwezig | afwezig | Toevoegen aan overgenomen modules |
| UI-stack | React 18, Tailwind **v4**, custom componenten | React 18, Tailwind **v3**, custom + TipTap/Konva/dnd-kit | Editor-libs overnemen, Tailwind-versie gelijktrekken |

**Goed nieuws:** beide schema's gebruiken al hetzelfde patroon voor "systeem- vs organisatie-records" (nullable tenant-id + `isSystem` voor globale templates). En álle 4 App-rollen passen op rollen die Beheer's `Role`-enum al kent (`SUPERUSER`, `ORG_ADMIN`, `WERKVOORBEREIDER`, `INSPECTEUR`) — er zijn géén nieuwe rollen nodig.

---

## 3. Naam- & conventieconversie (geldt voor alle overgenomen code)

Mechanische regels die op elk overgenomen model/module worden toegepast:

1. **Tabelnaam**: `@@map("xxx")` → `@@map("imp_xxx")`.
2. **Id/FK-types**: `String @id @default(uuid())` → `String @id @default(uuid()) @db.Uuid`; alle FK's `@db.Uuid`.
3. **Tenant-kolom**: `organizationId` → `orgId` (`@map("org_id")`).
4. **Rollen**: `@Roles('administrator')` → `@Roles(Role.ORG_ADMIN)` etc. (zie §6.2).
5. **Org-scoping**: vervang ad-hoc `where: { organizationId: user.organizationId }` door Beheer-helpers `orgScope(user)`, `assertSameOrg(...)`, `paginate(...)`, `assertFound(...)` uit `@/common`.
6. **Response**: handmatige `{ success, data }`-wrapping verwijderen waar Beheer een globale interceptor heeft.
7. **Soft-delete**: `deletedAt`-only modellen krijgen Beheer's expliciete `isDeleted: false`-filter; **behoud `deletedAt`** op tabellen die meedoen in sync (nodig voor tombstone-detectie in `/sync/pull`).
8. **Controller-prefix**: alleen resourcenaam in `@Controller(...)` (globale `/api/v1` wordt automatisch toegevoegd).

**Naamconflicten die expliciet opgelost moeten worden** (zelfde naam, ander concept):

| Naam | Beheer | App | Besluit |
|---|---|---|---|
| `Location` (model) | klantlocatie onder `Contact` | boom-node onder `InspectionPlan` | App-versie hernoemen → `InspectionLocation` / `imp_inspection_locations` |
| `Project` (model) | volwaardig dossier met `projectNumber` | lichte variant | **Beheer's `Project` hergebruiken**; App's niet importeren |
| `ProjectStatus` (enum) | `ACTIEF/ON_HOLD/...` | `draft/active/...` | Beheer-enum gebruiken; App-enum vervalt (status via lookup) |
| `AuditAction` (enum) | `CREATE/UPDATE/DELETE` | + `restore/status_change/...` | Beheer-enum gebruiken; eventueel uitbreiden |
| `Client` (model) | — | opdrachtgever | **Niet importeren**; mappen op `Contact` (keuze 1) |

---

## 4. Onderdeel A — Database & Prisma-schema

Dit is het fundament; alle andere onderdelen bouwen hierop.

### 4.1 Wat overkomt (net-nieuw inspectiedomein)

De volgende modelgroepen bestaan níet in Beheer en worden toegevoegd (met `imp_`-prefix, `uuid`, `orgId`, Beheer-conventies):

- **Norm & classificatie**: `NormTypeDefinition`, `NormConfiguration`, `ClassificationModel`, `ClassificationCharacteristic`, `ClassificationOption`.
- **Asset-/locatietype-config (dynamische velden)**: `AssetTypeDefinition`, `AssetTypeField`, `AssetTypeConstraint`, `AssetTypeMeasurementConfig`, `LocationTypeDefinition`, `LocationTypeField`, `LocationTypeConstraint`.
- **Checklistbeheer**: `ChecklistItem`, `Checklist`, `ChecklistItemLink`, `ChecklistVersionHistory`, `Category` (unified; legacy `ChecklistCategory` overslaan).
- **Templates**: `FindingTemplate`, `MeasurementFieldTemplate`, `ReportTemplate`, `InspectionTemplate` (+ checklist/meetstaat-links + version-history).
- **Meetstaten**: `MeasurementSheetTemplate`, `MeasurementSheetSection`, `MeasurementSheetField`, `MeasurementSheetVersionHistory`, `MeasurementSheetRecord`.
- **Inspectie-uitvoering (PWA-data)**: `InspectionPlan`, `Asset`, `VisualInspection`, `MeasurementRecord`, `Finding`, `Photo`, `Signature`, `Report`, `InspectionLocation` (hernoemd), `LocationImage`, `LocationImageMarker`, `StandaloneMeasurement`, `StandaloneMeasurementValue`.
- **Document-generatie**: `DocumentTemplate`, `DocumentTemplateDocxRevision`, `DocumentSection`, `GeneratedDocument`, `DocumentSignature`.
- **Sync & devices**: `SyncQueue`, `DeviceRegistration`.
- **Client-portal (2e realm)**: `ClientUser`, `ClientAccess`, `ClientMagicLink`, `InspectionClientAccess`, `InspectionMessage`, `MessageAttachment`, `FindingResolution`, `FindingResolutionPhoto`, `ClientRequest`.
- **Voice**: `VoiceBasePrompt`, `VoiceTemplatePrompt`, `VoiceUserPrompt`.
- **Lookup-tabellen** (status-types die App al naar lookups migreerde): `finding_status_types`, `plan_status_types`, `asset_status_types`, `report_status_types`, `inspection_types`, `client_request_types`, `client_request_status_types`, `signatory_types`, `signer_roles`, `pass_fail_status_types`, `resolution_status_types`, `project_status_types`. → Overzetten in Beheer's lookup-stijl: **per-org met nullable `orgId` + `isSystem`** (zoals `LostReason`/`ContactPersonRoleOption`).

### 4.2 Wat NIET overkomt (door keuze 1)

- `Client`, `ClientAddress`, `ClientContact` → vervangen door koppelingen naar `Contact`/`ContactAddress`/`ContactPerson`.
- App's `Project`, `OrganizationContact`, `Team`/`TeamMember`, App's `AuditLog`, App's `ClientCategory`/legacy enums → niet importeren (Beheer-equivalent of niet nodig).

### 4.3 Koppelpunten op bestaande Beheer-modellen

- `InspectionPlan.contactId` → `Contact` (i.p.v. `clientId → Client`). Adres komt uit gekoppelde `Location`/`ContactAddress`.
- `InspectionPlan.projectId` → Beheer's `Project` (optioneel).
- `InspectionPlan.assigneeId` / `reviewerId` → Beheer's `User`.
- `ClientAccess.contactId` → `Contact` (i.p.v. `Client`): een externe client-user krijgt inzage per `Contact` en/of per inspectie.
- `Organization` en `User`: velden van App **uniëren** in de bestaande Beheer-modellen (App heeft o.a. org-NAW/`kvkNumber`/`settings`, user `phone`/`lastLoginAt`/`preferences`). Geen aparte tabellen.

### 4.4 Werkstappen

1. Modellen groepsgewijs toevoegen aan `apps/api/prisma/schema.prisma` met de conversieregels uit §3.
2. Relaties herleggen naar `Contact`/`Project`/`User` (§4.3).
3. `InspectionPlan` e.d.: bepaal of **deep tables** (`Asset`, `Finding`, `MeasurementRecord`, ...) een eigen `orgId` krijgen (Beheer-conventie: orgId overal) of transitief scopen via `InspectionPlan`. **Advies:** `orgId` toevoegen op de centrale tabellen (`Asset`, `Finding`, `InspectionLocation`, `MeasurementSheetRecord`) voor eenvoudige `assertSameOrg`-checks; bladtabellen mogen transitief.
4. Migratie maken **vanuit `apps/api/`**: `npx prisma migrate dev --name add-inspection-domain` (nooit `db push`).
5. Seed uitbreiden (`prisma/seed.ts`): systeem-normtypes, classificatiemodellen, voorbeeld-checklists, meetstaat-templates, asset-/locatietypes, een demo-inspectieplan met assets/findings. Let op de **cleanup-volgorde** (kinderen eerst) — nieuwe FK's toevoegen aan de bestaande `deleteMany`-keten.
6. `apps/portal/src/types/index.ts` uitbreiden met de nieuwe interfaces.
7. Audit-trail: nieuwe modellen toevoegen aan `AUDITED_MODELS` + `MODEL_TABLE_MAP` in `prisma.service.ts`, FK-resolvers in `audit-log.service.ts`, NL-veldlabels in `audit-field-labels.ts`.

---

## 5. Onderdeel B — API (NestJS backend)

Beide API's zijn NestJS 10 + Prisma 5, dus de modules zijn relatief schoon over te zetten. De ~27 App-modules worden overgenomen en omgebouwd naar Beheer-conventies.

### 5.1 Over te nemen modules (in volgorde van afhankelijkheid)

**Configuratie/referentie eerst** (worden door de rest gebruikt):
`norm-types`, `classification-models`, `categories`, `asset-types`, `location-types`, `finding-templates`, `checklists` (+ items/categories), `measurement-sheet-templates` (+ sections/fields), `inspection-templates`.

**Uitvoeringsdomein**:
`inspection-plans` (+ portal-inspections), `assets`, `findings`, `locations` (→ inspection-locations), `location-images`, `standalone-measurements`, `measurement-sheet-records`, `visual-inspections`/`measurement-records` (via assets).

**Sync & devices**: `sync` (zie §8.3).

**Document-generatie**: `document-templates`, `document-generation` (service-only), `generated-documents` (incl. publieke `signature-requests`).

**Dashboard**: `portal-stats`.

**Client-realm**: `client-auth`, `client-inspections`, `client-documents`, `client-findings`, `client-messages`, `client-requests` (zie Onderdeel D).

**Voice**: `voice`, `voice-prompts`, `voice-prompt-admin` (zie §8.5).

### 5.2 Per module: ombouwwerk

Voor elke module dezelfde checklist:

- [ ] Controllers/services kopiëren naar `apps/api/src/modules/<naam>/`.
- [ ] `organizationId` → `orgId`; `orgScope(user)` / `assertSameOrg(...)` toepassen i.p.v. handmatige filters.
- [ ] `@Roles('...')` (string) → `@Roles(Role.XXX)` (Beheer-enum). Stringrollen mappen via §6.2.
- [ ] Registreren onder Beheer's globale guard-volgorde (`JwtAuthGuard` → `RolesGuard` → `TenantGuard`).
- [ ] `paginate()` / `assertFound()` gebruiken; NL not-found meldingen.
- [ ] `@ApiTags()` + `@ApiOperation()` voor Swagger; rate-limit waar nodig (`@Throttle`).
- [ ] Storage-calls via `STORAGE_PROVIDER` (niet direct R2-class) — zie §8.2.
- [ ] Response-envelope laten afhandelen door Beheer's interceptor.
- [ ] Unit-spec + E2E-spec in Beheer-stijl (zie §8.6).
- [ ] Route-volgorde: specifieke routes vóór `:id`-routes.

### 5.3 Aandachtspunten

- **`norm_type` is geen enum meer**: App migreerde `norm_type`-kolommen naar `TEXT` + FK → `norm_type_definitions`. Neem de **lookup-realiteit** over, niet de verouderde enum-declaraties in App's `schema.prisma` (die nog drift bevatten).
- **`organizations` zijn in App verwijderbaar**, in Beheer bewust niet (te destructief). Houd Beheer's beleid aan: geen org-delete.
- **Superuser-scoping**: App laat superadmin (`organizationId = null`) álle orgs zien/pullen. In Beheer's model loopt dit via het superuser-subdomein — herijk de superuser-paden.

---

## 6. Multi-tenancy & rollen (cross-cutting, kritisch)

### 6.1 Tenancy inschuiven in Beheer's subdomein-model

App kent géén subdomein/host-logica; Beheer resolveert de tenant uit de hostname vóór de controller en dwingt `user.orgId === tenant.orgId` centraal af. Bij overname:

- Alle overgenomen modules erven automatisch Beheer's `TenantMiddleware`/`TenantGuard` (globaal geregistreerd) — geen per-module hostlogica nodig.
- Verwijder App's impliciete "single-domain"-aannames; org komt uit `@CurrentTenant()` / `@CurrentUser()`.
- Cross-tenant FK-validatie (`assertSameOrg`/`assertAllSameOrg`) toevoegen op alle create/update-endpoints die UUID-FK's accepteren (bv. `inspectionPlanId`, `assetTypeId`, `templateId`).

### 6.2 Rolmapping

| App `UserRole` | → Beheer `Role` |
|---|---|
| `superadmin` | `SUPERUSER` |
| `administrator` | `ORG_ADMIN` |
| `werkvoorbereider` | `WERKVOORBEREIDER` |
| `inspecteur` | `INSPECTEUR` |

Beheer's extra rollen `MANAGER` en `BACKOFFICE` blijven bestaan en kunnen later rechten in het inspectiedomein krijgen. Omdat Beheer `roles Role[]` (array) gebruikt, wordt een geporte inspecteur simpelweg `roles: [INSPECTEUR]`. Permissielogica van App's modules (wie mag templates beheren, wie mag reviewen) vertalen naar Beheer's `@Roles(...)`.

### 6.3 E-mail-uniciteit

App: `@@unique([organizationId, email])` (per org). Beheer: `email @unique` (globaal). Omdat er **geen data migreert**, hoeven we geen botsingen op te lossen — we behouden Beheer's globale uniciteit. Wel vastleggen als productregel (kan dezelfde persoon bij twee orgs? In Beheer: nee).

---

## 7. Onderdeel C — Beheer-portal (GUI voor inspectiebeheer)

De inspectie-**beheerfunctionaliteit** (de vier `*_BEHEER_SPEC.md`-documenten in de App-repo: Checklists, Constateringen/Classificatiemodellen, Inspectie-templates, Meetstaat-templates) verhuist naar de bestaande Beheer-portal en wordt herbouwd in Beheer's GUI-patronen.

### 7.1 Pagina's/secties die erbij komen

- **Inspecties** — lijst + review/goedkeuring (uit App's `inspections/*`).
- **Assets-register** + **Asset-types** (field/constraint-builder) en **Locatie-types**.
- **Templates-hub**:
  - Checklists (+ checklist-items bibliotheek, categorieën)
  - Constateringen (finding-templates) + import/export
  - Classificatiemodellen (systeem)
  - Normtypes (systeem)
  - Meetstaat-templates (form-builder met secties/velden/validaties)
  - Inspectie-templates (configuratie + checklists + **block-editor** documenttemplates + versiehistorie)
- **Floor-plan/locaties** (Konva-canvas met markers).
- **Voice-prompts** (admin) — zie §8.5.

### 7.2 Herbouwen in Beheer-conventies

App-portal gebruikt eigen Context-auth, `localStorage`-tokens, geen org-theming. Beheer heeft strakke patronen die we volgen:

- **Overzichtspagina's**: `DetailPageLayout` + `TableConfigSidebar` + `useTableConfig` + `ColumnDef<T>[]`.
- **Detailpagina's**: `DetailPageLayout` + `AuditHistory`-sidebar + tab-navigatie + inline bewerken (Overzicht-tab) via react-hook-form/zod.
- **Status**: `StatusBadge` + mappings in `lib/status.ts` (nieuwe maps voor `PLAN_STATUS`, `CHECKLIST_STATUS`, `MEASUREMENT_SHEET_STATUS`, etc.).
- **Hooks**: `use-<resource>.ts` per domein met `apiClient` + TanStack Query (geen handmatige `useEffect`-fetches).
- **Tenant/branding**: pagina's draaien automatisch onder `TenantProvider` + org-theming.

### 7.3 Nieuwe frontend-dependencies (uit App-portal)

Toevoegen aan `apps/portal`: **TipTap** (rich-text in block-editor), **Konva/react-konva** (floor-plan), **@dnd-kit** (Beheer heeft dit al voor Kanban — hergebruiken), **recharts** (dashboard). Let op: Beheer draait **Tailwind v4**, App-portal **v3** — UI-componenten moeten op v4 worden gezet (utility-namen checken).

### 7.4 Block-editor (gedeeld concept)

App's portal heeft een volwaardige WYSIWYG block-editor voor documenttemplates (`TemplateMode = SECTIONS | BLOCKS | DOCX`, `ContentBlock`-types: rich_text, image, divider, spacer, placeholder, toc, findings_table, asset_summary, measurement_data, signature_block). De `BlockDefinition`-registry kent al een `'quote'`-categorie — herbruikbaar voor Beheer's bestaande offerte-/quote-documenten. Deze types zitten in App's `packages/shared/src/types/block-editor.ts` (zie §8.1).

---

## 8. Cross-cutting subsystemen

### 8.1 Shared package / types

App heeft een `packages/shared` met domeintypes, constants, Zod-schemas en de block-editor-types. Beheer houdt types in `apps/portal/src/types`. **Advies:** geen nieuwe workspace-package introduceren; de relevante types overzetten naar Beheer's `types/` en (waar back-end ze deelt) naar een kleine `apps/api`-types map of een lichte interne package. Block-editor-types één keer definiëren en door portal + client-portal + API gebruiken.

### 8.2 Storage (R2 achter de interface)

App gebruikt een concrete `StorageService` op Cloudflare R2 (AWS S3-SDK). Beheer heeft een `STORAGE_PROVIDER`-injectietoken met `LocalStorageProvider`. **Actie:** een `R2StorageProvider implements StorageProvider` toevoegen (upload/download/delete/exists + `getSignedUrl`), env-vars `R2_*` overnemen, lokaal `LocalStorageProvider` als default. Alle doc-/foto-uploads lopen dan via de bestaande abstractie.

### 8.3 Sync (PWA-contract — niet breken)

De externe PWA hangt aan een vast wire-contract. Bij overname **exact behouden**:

- `GET /sync/pull?since=<ISO>&entities[]=...` — entiteitsleutels: `inspection_plans, assets, visual_inspections, measurement_records, findings, photos, signatures`.
- `POST /sync/push` — payload `{ deviceId, clientTime?, changes: SyncChangeDto[] }`; `SyncChangeDto = { entityType, entityId (client-UUID), operation, baseVersion?, data }`.
- `POST /sync/resolve` — `{ entityType, entityId, resolution: client|server|merge, data? }`.
- `POST /photos/upload` — multipart blob + metadata.
- Auth: **interne** user-JWT (niet de client-JWT); `X-Device-ID`-header doorlaten.
- **Tombstones**: `deletedAt > since` blijft de delete-detectie → daarom `deletedAt` behouden op sync-tabellen (naast Beheer's `isDeleted`).
- Conflict: last-write-wins met optimistic-concurrency op updates; conflicten in `SyncQueue` (`status: conflict`).

Aanbeveling: contract **versioneren** (bv. behoud `/api/v1/sync/*`) zodat de PWA ongewijzigd kan blijven wijzen naar de nieuwe backend. CORS uitbreiden met `X-Device-ID`/`X-App-Version` (Beheer's dynamische subdomein-CORS aanpassen voor de PWA-origin/het aparte PWA-domein).

### 8.4 Document-generatie (zwaar, fase apart)

Modules `document-templates` + `document-generation` + `generated-documents`. Dependencies: **Puppeteer** (headless Chromium voor PDF), **Handlebars** (HTML-templating), **html-docx-js** (Word-export). Aandacht:

- Deploy: de API-image heeft een Chromium-binary nodig (grotere image / aparte worker). Documenteer dit in `DEPLOYMENT`.
- Publieke ondertekening: `generated-documents` bevat een **publieke** `signature-requests`-controller (extern ondertekenen via e-maillink) — onder Beheer's `@Public()` + strikte rate-limit zetten.
- E-mail: App had `// TODO: send email`-stubs; koppel aan Beheer's **Resend**-integratie.

### 8.5 Voice-input (Anthropic)

Modules `voice` (`POST /voice/parse-measurement`), `voice-prompts` (template/user) en `voice-prompt-admin` (base prompts, superadmin). Dependency: **@anthropic-ai/sdk**. 3-laags promptmodel (`VoiceBasePrompt` → `VoiceTemplatePrompt` → `VoiceUserPrompt`). Portal-beheerpagina's voor prompts meenemen. Env: Anthropic API-key. De PWA gebruikt `/voice/parse-measurement` + opgehaalde combined-prompt — endpoint stabiel houden.

### 8.6 Audit-trail

App's `audit_log`-tabel wordt **nooit geschreven** (geen middleware). Beheer's automatische `$use`-middleware is de standaard. Nieuwe inspectiemodellen toevoegen aan `AUDITED_MODELS` + FK-resolvers; App's aparte audit-tabel niet importeren. Eventueel `deviceId`-context toevoegen aan Beheer's audit voor mobiele acties.

### 8.7 Seed & tests

- **Seed**: uitbreiden met systeem-referentiedata (normtypes, classificatiemodellen, asset-/locatietypes, voorbeeld-checklists/meetstaten) + een demo-inspectie. Wachtwoord-conventie `Password123!` aanhouden.
- **Tests**: unit-specs (`*.spec.ts`) en E2E-suites in Beheer-stijl (serieel, `127.0.0.1` host, `e2e-`-prefix, opruimvolgorde). **Cross-tenant-suite** uitbreiden met de nieuwe inspectie-endpoints (FK-injectie van andere org → 403).

---

## 9. Onderdeel D — Client-portal (4e app)

Aparte externe app `apps/client-portal` in de monorepo (eigen Vite-build, eigen subdomein/host), die DB/schema/API deelt maar een **eigen auth-realm** heeft.

### 9.1 Backend (2e auth-realm)

- `client-auth`: aparte `ClientUser`-tabel, eigen secrets `CLIENT_JWT_SECRET`/`CLIENT_JWT_REFRESH_SECRET`, passport-strategie `"client-jwt"` (token `type: "client"`), `ClientJwtAuthGuard`. Endpoints: login/register/forgot/reset/me + **magic-link** onboarding.
- `client-inspections`, `client-documents`, `client-findings`, `client-messages`, `client-requests`.
- **Rewire t.o.v. keuze 1**: `ClientAccess`/`InspectionClientAccess` koppelen aan `Contact` (niet `Client`). Een externe gebruiker krijgt inzage per `Contact` en per inspectie.
- E-mail (magic-link, wachtwoord-reset, finding-notificaties) via Resend.

### 9.2 Frontend

App's `apps/client-portal` overnemen: routes `/login`, `/register`, `/magic/:token`, `/inspections(/:id)`, `/documents/:id`, `/requests(/new)`; tabs Overzicht/Constateringen/Berichten/Documenten; finding-resolutie met fotoupload; document-ondertekening (signature canvas). UI op Beheer's Tailwind-v4-stijl trekken (custom componenten, geen shadcn — beide repos gebruiken die toch al niet).

### 9.3 Multi-tenancy voor de client-portal

Te besluiten (zie §11): draait de client-portal ook subdomein-gebonden per org, of als één centraal klantportaal waar de `ClientAccess` de scope bepaalt? App's model is org-agnostisch (toegang via `ClientAccess`).

---

## 10. Onderdeel E — PWA inspectie-app (blijft extern)

Blijft in eigen repo; verandert in principe niet. Randvoorwaarden die wij moeten leveren:

- **Stabiele route-namespaces**: `/auth/*`, `/users/me`, `/sync/{pull,push,resolve}`, `/photos/upload`, en de referentie-data-lijsten (`asset-types`, `classification-models`, `finding-templates`, `measurement-sheet-templates`/`-records`, `location-images` + markers).
- **`{ success, data }`-envelope** en de **interne user-JWT** (Bearer + refresh) precies zoals nu.
- **Eigen API-endpoint op aparte server** (zoals jij aangeeft): de PWA mag naar een apart host/origin wijzen dat dezelfde backend/DB serveert. Regel CORS + (optioneel) een PWA-specifiek subdomein. De Dexie/offline-laag (schema v7) blijft ongewijzigd zolang het contract klopt.

Concreet voor ons: bij elke wijziging aan sync/auth/referentie-endpoints **het contract bewaken** (contracttest of versionering).

---

## 11. Open punten / nog te beslissen

1. **Client-portal-tenancy**: subdomein-per-org of één centraal klantportaal (§9.3)?
2. **`InspectionPlan` ↔ CRM-diepte**: hangt een inspectie aan `Contact` + `Location`, of ook aan `ContactPerson` (contactpersoon als aanspreekpunt)? En aan Beheer's `Project`/`WorkOrder`?
3. **Deep-table `orgId`**: expliciete `orgId` op `Asset`/`Finding`/etc. (denormalisatie, eenvoudiger guards) vs transitief via `InspectionPlan` (§4.3-stap 3)?
4. **PWA-domein/CORS**: welk host/subdomein krijgt de PWA, en moet die door de subdomein-tenantlogica heen of via een apart pad?
5. **Offerte ↔ inspectie**: moet een gewonnen offerte/aanvraag automatisch een inspectieplan genereren (koppeling Beheer-leadflow → inspectie-uitvoering)? Dit is de grootste *product*-winst van de samenvoeging en verdient een eigen ontwerp.
6. **Monorepo-package vs platte types**: nieuwe `packages/shared` of types in bestaande mappen (§8.1)?
7. **Lookup-tabellen**: globale systeemwaarden of per-org overschrijfbaar (§4.1)?

---

## 12. Gefaseerd stappenplan (aanbevolen volgorde)

| Fase | Inhoud | Resultaat |
|---|---|---|
| **0. Voorbereiding** | Besluiten §11 vastleggen; naam-/rolmap (§3, §6.2) bevriezen; integratiebranch. | Heldere conventies. |
| **1. Schema-fundament** | Inspectiemodellen in Beheer-schema (§4), relaties naar `Contact`/`Project`/`User`, migratie, seed-uitbreiding, types, audit-registratie. | Eén DB/schema, vers geseed. |
| **2. API kern-inspectiedomein** | Config- + uitvoeringsmodules porten (§5.1), Beheer-conventies (§5.2), storage-provider (§8.2). | Kern-API draait multi-tenant. |
| **3. Sync + PWA-contract** | `sync` + `photos/upload` + referentie-endpoints; contract bewaken; CORS/PWA-origin. | Externe PWA werkt tegen nieuwe backend. |
| **4. Document-generatie** | doc-templates, generated-documents, block-editor, Puppeteer/Handlebars/Word, publieke ondertekening, Resend. | Plannen/rapporten + ondertekenen. |
| **5. Beheer-portal GUI** | Inspectiebeheer-pagina's in Beheer-patronen (§7); TipTap/Konva-deps; Tailwind v4. | Eén GUI voor beheer + inspectie. |
| **6. Client-portal (4e app) + 2e realm** | `client-auth`/client-modules; `apps/client-portal`; `ClientAccess→Contact`. | Extern klantportaal live. |
| **7. Voice-input** | voice-modules + Anthropic + promptlagen + portal-promptbeheer. | Spraak-naar-meting. |
| **8. Hardening** | Unit/E2E/cross-tenant-tests, audit-wiring controleren, deploy (Chromium-image), env-vars, docs. | Productieklaar. |

---

### Bijlage — bronnen geanalyseerd
- `Inspexi-App/apps/api` (27 modules + `voice`), `main.ts`, `common/*`, `prisma/schema.prisma` (2631 regels) + migraties.
- `Inspexi-App/apps/portal`, `apps/client-portal`, `apps/inspectie-app`, `packages/shared`.
- `Inspexi-App/*_BEHEER_SPEC.md`, `docs/*`.
- `InspeXi-Beheer/CLAUDE.md` + `apps/api/prisma/schema.prisma` (1526 regels, 29+ modellen).

---

## Addendum — REQ1: interne chat additief over `/sync` v2 (PWA-brug)

> Toegevoegd bij REQ1 (interne chat). De chat is gebouwd in twee PR's: PR1 = chat-kern + presence in de Beheer-portal; **PR2 = deze additieve `/sync`-uitbreiding** zodat de **PWA-inspecteur** poll-based kan meedoen (backoffice ↔ inspecteur). Het bestaande `/sync` v2-contract is **heilig**: er is **niets gewijzigd of verwijderd**, alleen toegevoegd.

**Wat is additief toegevoegd** (zie `docs/fase3/FASE3-SYNC.md §1` voor het exacte contract):

- **Pull** krijgt drie nieuwe top-level keys — `chatThreads`, `chatMessages`, `users` (presence) — en twee nieuwe keys binnen `deletedIds` (`chatThreads`, `chatMessages`, tombstones via `deletedAt`). Alle bestaande keys/typen ongewijzigd; een oude PWA negeert onbekende keys.
- **Push** accepteert een nieuwe optionele `changes.chatMessages[]` (`create`/`delete`), en `processed` krijgt een `chatMessages`-teller.

**Bewuste ontwerpkeuzes (afwijkend van het generieke `inspectionPlans/assets/findings`-patroon, met reden):**

1. **Pull is read-only & membership-scoped.** De chat-snapshot levert alleen threads waar de gebruiker deelnemer (DIRECT) of rollid (TEAM) van is — exact dezelfde autorisatie als de REST-endpoints. Een inspecteur ziet dus nooit DIRECT-threads van anderen. `pull` schrijft geen rijen (team-threads worden in de portal geprovisioneerd, niet tijdens een pull).
2. **Chat-push gaat NIET via de generieke mutator,** maar wordt gedelegeerd naar `ChatService.sendMessage`. De generieke mutator zou (a) de membership-check overslaan, (b) de notificatie-dispatch (@mentions + nieuw-bericht, gededupliceerd) en read-state overslaan, en (c) botsen op veldnaam `createdBy` (chat gebruikt `senderId`). Delegeren behoudt al deze garanties. Push is **idempotent** op het client-`id` (replay-veilig); `delete` is een soft-delete van een **eigen** bericht.
3. **Threads worden niet via push aangemaakt.** De PWA antwoordt in bestaande, server-side geprovisioneerde threads. Interactief versturen kan ook via de bestaande REST `POST /chat/threads/:id/messages` (de PWA heeft de user-JWT); `/sync/push` dient de offline-queue-replay.

**Schema-voorbereiding (al in PR1):** `ChatThread`/`ChatMessage` dragen `deletedAt` (tombstones), `syncedAt` en `deviceId`, zodat PR2 geen tweede migratie op dezelfde tabellen nodig had.

**Auth:** interne user-JWT (`@Roles(ALL_STAFF)`) + `deviceId` in de push-body (zoals het bestaande contract). De PWA-implementatie zelf staat in de aparte `Inspexi-App`-repo en haakt aan op deze additieve keys.
