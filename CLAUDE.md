# InspeXi Beheer — Claude Context

Multi-tenant inspectie-managementplatform (CRM, leads, offertes, taken, documenten).
Monorepo met **NestJS API** + **React Portal**, Turbo + pnpm workspaces.

## Actuele status (laatst bijgewerkt: juni 2026) — lees dit eerst

> De secties verderop beschrijven deels de **pre-integratie kern** (genoemd als "29 modellen / 2 apps / 15 modules"). Sinds de integratie van het oude **Inspexi-App** inspectiedomein geldt de stand hieronder.

**4 apps in de monorepo:**
- `apps/api` — NestJS, ~60 modules, **148 Prisma-modellen** (API :3000, Swagger `/api/docs`)
- `apps/portal` — staf-backoffice (:5173, Tailwind v4)
- `apps/client-portal` — extern klantportaal, 2e auth-realm `ClientUser` (:5174)
- `apps/convert-api` — losse NestJS-microservice voor DOCX⇄PDF (libreoffice-convert)
- PostgreSQL :5433 (`docker compose up -d`). De **PWA inspecteur-app blijft een aparte repo** (`../Inspexi-App`) en praat via het `/sync` **v2-contract** met deze backend.

**Integratie-fasen — allemaal afgerond** (zie `docs/INTEGRATIE-INSPEXI-APP.md` + `docs/fase1..6/`): schema-fundament, API kern-inspectiedomein, sync v2 (server + PWA-cutover), document-generatie (Puppeteer-PDF/Word/ondertekenen), portal beheer-GUI's, client-portal + client-realm, voice. PWA v2-sync-cutover zit in de `Inspexi-App`-repo (branch `feat/pwa-v2-sync-contract`, Dexie v9).

**Unified AssetNode-boom (branch `feat/unified-asset-node-tree`):** de losse `Asset`- en `InspectionLocation`-modellen zijn opgegaan in één recursief **`AssetNode`**-model (`nodeType` `LOCATION` | `ASSET`) met een PostgreSQL **ltree** `path`/`depth` die door DB-**triggers** wordt onderhouden (de service zet pad/diepte nooit zelf; insert parents vóór kinderen). De boom-wortel is een LOCATION-node met `rootLocationId` (1:1 → CRM-`Location`); een inspectieplan koppelt zijn **hoofdlocatie** via `InspectionPlan.locationId` en zijn scope-deellocaties via **`InspectionPlanLocation`**. Nieuwe module **`asset-nodes`** levert de tree-CRUD; de oude **`assets`**- en **`inspection-locations`**-endpoints zijn nu **compat-wrappers** op `AssetNodesService` (verdwijnen ná de PWA-cutover, zie `docs/fase3/PWA-CUTOVER-ASSET-NODE.md`). Uitvoeringsrecords (Finding/VisualInspection/MeasurementRecord/MeasurementSheetRecord) refereren `assetNodeId` + `inspectionPlanId`; de `/sync`-push is op **contract v3** (AssetNode-boom). Elke node krijgt een **server-toegekend, uniek-per-org `nodeNumber`** (`@@unique([orgId, nodeNumber])`) via de bestaande nummering-engine: twee onafhankelijke `NumberingModel`-waarden **`LOCATION_NODE`** (default `LOC-####`) en **`ASSET_NODE`** (default `[typecode]-####`), gekozen op `nodeType`. De nieuwe placeholder **`[typecode]`** lost op naar de `shortCode` van het asset-/locatietype (`AssetTypeDefinition`/`LocationTypeDefinition`). `nodeNumber` is read-only voor de client (zoals `orgId`): toegekend in `AssetNodesService.create`/`createRoot` én in de `/sync` assetNodes-push.

**Beschikbaarheid inspecteurs (PRD-12, module `availability`):** per-inspecteur beschikbaarheid via **4 modellen** (`AvailabilityTemplate` + `AvailabilityTemplateSlot` = herbruikbaar weekschema; `UserScheduleAssignment` = tijdgebonden koppeling schema→inspecteur met `validFrom`/`validUntil`; `AvailabilityException` = eenmalige/herhalende `BESCHIKBAAR`/`GEBLOKKEERD`-uitzondering) plus `User.employmentType` (`DIENSTVERBAND` | `FREELANCE`, nullable). De **resolutie** (`AvailabilityResolutionService`) combineert per dag baseline (alleen DIENSTVERBAND + geldig weekschema) + plus-laag (BESCHIKBAAR) − min-laag (GEBLOKKEERD) → intervallen; precedentie **GEBLOKKEERD > BESCHIKBAAR > baseline**. Endpoints onder `/availability`: `templates` (CRUD), `users/:id/schedule` (toewijzen), `exceptions` (CRUD, INSPECTEUR mag alleen zichzelf), `resolved` (per dag, max 3 mnd) en `check` (tijdvenster). Portal: **Organisatie → Beschikbaarheid** (templates/schema-beheer), user-detail-tab (dienstvorm + schema + uitzonderingen), `/my-availability` (inspecteur zelf), en de **planning-integratie** (§12.9, zie gotchas): bij inspecteur-toewijzen/verzetten checkt de backend de dag en geeft een 409 met `warnings` bij onbeschikbaarheid (override via `overrideAvailabilityWarnings: true`, gelogd in `PlanningHistory` als `AVAILABILITY_OVERRIDE`). Kalender dempt niet-beschikbare dagen wanneer op één inspecteur gefilterd is.

**AI-voorcontrole inspectierapporten (PRD-13, module `ai-review`):** adviserende AI-review van ingediende inspectieplannen via twee modellen (`AiReviewRun` + `AiReviewItem`) en een **gedeelde `AnthropicClientService`** in `common/services/anthropic/` (ook door `voice` gebruikt; latere AI-functies haken hier aan). Drie nieuwe `Organization`-velden: **`inspectionReviewEnabled`** (default `true` — vier-ogen-principe: plan mag pas naar `completed`/`approved` ná menselijke review, gate zit in `inspection-plans.service.update()`), **`aiReviewEnabled`** (default `false`) en **`aiReviewInstructions`** (org-specifieke promptlaag, max 2000 tekens). Entitlement: add-on-key **`AI_REVIEW`** in de catalogus (`@inspexi/entitlements`); routes zijn `@RequiresFeature('AI_REVIEW')` behalve `GET /ai-review/status` (beschikbaarheid + model, voor de settings-UI). Endpoints: `GET|POST /inspection-plans/:id/ai-review` (laatste run incl. items resp. handmatige her-run, POST throttled 5/min, REVIEW_ROLES) en `PATCH /ai-review-items/:id` (`{status: CHECKED|DISMISSED|OPEN}`). Bij `submit()` start de run **fire-and-forget** (guards in `startRun`: entitlement + org-toggle + API-key + max één PENDING-run per plan → 409); output afgedwongen via tool-use-schema, terugverwezen id's gevalideerd tegen de input; afloop → notificatie `AI_REVIEW_GEREED` naar `plan.reviewerId`. De PENDING-guard is race-vrij via een **partial unique index** `imp_ai_review_runs_pending_plan_key` (`WHERE status='PENDING'`; P2002 → 409) — die leeft nét als de ltree-GIST-index **buiten het Prisma-schema**: strip door `migrate dev` gegenereerde `DROP INDEX`-regels voor beide indexen altijd handmatig uit nieuwe migraties. Verweesde PENDING-runs (>10 min, bv. na een API-herstart mid-run) worden bij een nieuwe start als FAILED afgeboekt. De **vier-ogen-gate** geldt ook in de `/sync`-push (`assertPlanReviewGate` in `sync.service`); `reviewedAt`/`approvedAt` zijn daar server-owned (niet client-schrijfbaar). Config: gedeelde `ANTHROPIC_API_KEY` + **`ANTHROPIC_REVIEW_MODEL`** (default `claude-sonnet-4-6`, zie `.env.example`). Portal: AI-paneel op de inspectie-detailpagina + org-settings-tab "Inspecties"; de org-vlaggen gaan via de publieke by-slug branding naar alle stafrollen. Seed: bij `SEED_DEMO=1` krijgt de demo-org de toggle aan + een `AI_REVIEW`-override en één COMPLETED demo-run met 5 items op het demo-plan.

**Inspectiedomein — waar te vinden in de portal:**
- **Organisatie → Inspectie-config** (org-admin): inspectie-templates (block-editor document-builder), checklists (+items/categorieën), constateringen (finding-templates), asset-types, locatie-types, lookups, voice-prompts.
- **Organisatie → Inspectie-systeem** (SUPERUSER-only, op `mijn.localhost`): classificatiemodellen, normtypes, meetstaat-templates, voice base-prompts.
- **Inspecties** (uitvoering): detail-tabs Overzicht / Assets (+findings, +meetstaat-records) / Plattegrond (Konva floor-plan) / Documenten (genereren/preview/PDF/Word/ondertekenen). Veel uitvoeringsdata ontstaat normaal in de PWA.
- **Client-portal** (`:5174`): magic-link login, inspecties inzien, constatering oplossen + foto, document ondertekenen, verzoeken indienen.

**Operationele gotchas (belangrijk voor browser-/dev-werk):**
- `pnpm db:seed` **wist en herseed't de hele DB incl. users** → daarna opnieuw inloggen. Soms houdt de API daarna een **stale tenant-cache** (5 min) → een org geeft dan "niet gevonden"; **herstart de API** om de cache te legen.
- Seed-wachtwoorden: `Password123!`. Staf-login op `inspexidemo.localhost:5173` (`admin@inspexi-demo.nl`); SUPERUSER op `mijn.localhost:5173` (`superuser@inspexi.nl`).
- Demo-klant voor de client-portal (uit de seed): `http://inspexidemo.localhost:5174/magic/demo-klant-magic` → logt **direct in zonder wachtwoord** (vaste magic-link op het demo-inspectieplan). **Let op (K3-hardening):** deze wachtwoordloze magic-links worden alleen geseed met **`SEED_DEMO=1`** (`SEED_DEMO=1 pnpm db:seed`); zonder die vlag worden ze overgeslagen en werkt de directe client-portal-demo-login niet. De geseede links verlopen bovendien na 30 dagen (niet meer in 2099).
- Het demo-inspectieplan hangt op de unified AssetNode-boom: hoofdlocatie (= CRM-Locatie "Kantoorpand Zuidas") → deellocatie "Verdieping 1" (scope) → 2 assets + findings + 1 plattegrond (LocationImage op de wortel-node) + markers + 2 meetstaat-records + een gegenereerd (ondertekenbaar) document.
- Voice `/voice/parse-measurement` vereist een `ANTHROPIC_API_KEY` in `apps/api/.env`. Document-generatie vereist Chromium voor Puppeteer in de API-image bij deploy.

**Teststatus:** Streams A–E + G + PWA-sync zijn end-to-end gevalideerd (unit/e2e/build groen + browser-smoketests). Enig open punt: voice `/voice/parse-measurement` (wacht op Anthropic-key). Gevonden+opgeloste bugs: refresh/deeplink→dashboard-race, cross-tenant read 403→404, assets niet zichtbaar op staf-inspectie, ontbrekende staf-documenten-UI, meetstaat-records niet zichtbaar op staf.

---

## Taal & Stijl

- Code, commits, branchnamen en technische docs: **Engels**
- UI labels, validatiemeldingen, seed data, PRD: **Nederlands**
- Commit messages: korte samenvatting (Engels), Co-Authored-By Claude

## Snelstart

```bash
pnpm install                  # Installeer dependencies
docker compose up -d          # Start PostgreSQL 15 (poort 5433)
pnpm db:migrate               # Prisma migraties
pnpm db:seed                  # Seed testdata
pnpm dev                      # Start API (3000) + Portal (5173)
```

## Projectstructuur

```
/
├── apps/
│   ├── api/                  # NestJS backend (poort 3000)
│   │   ├── prisma/
│   │   │   ├── schema.prisma # 29 modellen, alle enums
│   │   │   └── seed.ts       # Testdata (Password123! voor alle users)
│   │   ├── src/
│   │   │   ├── main.ts       # Bootstrap, Swagger, CORS, middleware
│   │   │   ├── app.module.ts # Root module, guards, middleware registratie
│   │   │   ├── common/       # Guards, middleware, decorators, filters, interfaces
│   │   │   ├── modules/      # 15 feature modules
│   │   │   └── prisma/       # PrismaService
│   │   └── test/             # 12 E2E test suites
│   └── portal/               # React 18 frontend (poort 5173)
│       └── src/
│           ├── main.tsx       # React root, providers
│           ├── App.tsx        # Routes, lazy loading
│           ├── providers/     # AuthProvider, TenantProvider, ToastProvider
│           ├── pages/         # ~20 pagina's per domein
│           ├── components/    # UI, layout, auth, documents, table-config
│           ├── hooks/         # use-api-query, use-api-mutation, use-audit-log
│           ├── lib/           # api-client, tenant, audit utils
│           └── types/         # Alle TypeScript interfaces
├── docker-compose.yml        # PostgreSQL 15 Alpine
├── turbo.json                # Build pipeline
└── pnpm-workspace.yaml       # Workspace definitie
```

## Tech Stack

| Component | Technologie |
|---|---|
| Backend | NestJS 10, Prisma 5, PostgreSQL 15 |
| Auth | Passport-JWT, bcrypt, httpOnly refresh cookies |
| Email | Resend |
| Frontend | React 18, React Router 6, TanStack Query 5 |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS v4 (custom UI components, geen component library) |
| Drag & Drop | @dnd-kit (Kanban bord aanvragen) |
| Document Preview | docx-preview (DOCX), xlsx/SheetJS (XLSX), native (PDF/img/CSV/SVG) |
| Build | Vite 6 (portal), Nest CLI (api), Turbo |
| Testing | Jest (API unit + E2E), Vitest (portal) |

## Database

PostgreSQL 15 via Docker op poort **5433**. Alle tabellen hebben prefix `imp_`.

### Enums

- **Role**: `SUPERUSER` | `ORG_ADMIN` | `MANAGER` | `BACKOFFICE` | `WERKVOORBEREIDER` | `INSPECTEUR`
- **ContactType**: `COMPANY` | `INDIVIDUAL`
- **PriceType**: `FIXED` | `TIERED`
- **RequestStatus**: `NIEUW` | `IN_BEHANDELING` | `OFFERTE_GEMAAKT` | `GEWONNEN` | `VERLOREN` | `ON_HOLD`
- **QuoteStatus**: `CONCEPT` | `TER_GOEDKEURING` | `GOEDGEKEURD` | `VERSTUURD` | `BEKEKEN` | `GEACCEPTEERD` | `AFGEWEZEN` | `VERLOPEN`
- **TaskStatus**: `TE_DOEN` | `MEE_BEZIG` | `VOLTOOID`
- **AuditAction**: `CREATE` | `UPDATE` | `DELETE`
- **DocumentEntityType**: `CONTACT` | `REQUEST` | `QUOTE` | `PRODUCT` | `TASK`
- **NotificationType**: 14 types (offerte lifecycle, aanvragen, taken, documenten)

### Modellen (29)

**Foundation**: Organization, User, RefreshToken, Invitation
**CRM**: Contact, ContactAddress, ContactPerson, CustomerGroup, ContactCustomerGroup, Location, ContactLog, ContactEmail
**Producten**: Product, PriceTable, PriceTableItem, PriceTier, ContactPriceTable
**Aanvragen**: Request, RequestStatusHistory
**Offertes**: QuoteTemplate, Quote, QuoteLine, QuoteApprovalRequest
**Notificaties**: Notification, NotificationPref, NotificationGroupPref
**Overig**: AuditLog, Task, Document

## API Architectuur

### Global Guards (volgorde in app.module.ts)

1. **JwtAuthGuard** — Valideert Bearer token; `@Public()` slaat over
2. **RolesGuard** — Afdwingen van `@Roles(Role.MANAGER)` decorator
3. **TenantGuard** — Controleert `user.orgId === tenant.orgId` (multi-tenant isolatie)

### Multi-Tenancy (subdomein-gebaseerd)

- **TenantMiddleware** op alle routes: extraheert slug uit hostname, cacht Organization (5 min)
- Hostnames worden geclassificeerd in 3 typen:
  - `superuser`: `mijn.localhost` / `mijn.inspexi.nl` — alleen SUPERUSER gebruikers
  - `org`: `voorbeeldbedrijf.localhost` — org-specifieke toegang
  - `unknown`: `127.0.0.1`, IP-adressen — geen restricties (E2E tests)
- **Org-cache**: `TenantCacheService` (`common/services/tenant-cache.service.ts`, @Global) — gedeelde slug→Organization cache (5 min TTL); `OrganizationsService.update()` invalideert direct. Inactieve orgs (`Organization.isActive = false`) krijgen 404 van de middleware (offboarding)
- **Trust proxy**: `main.ts` zet `trust proxy = 1` zodra `BASE_DOMAIN !== 'localhost'` (X-Forwarded-Host bepaalt dan req.hostname); lokaal expliciet uit tegen hostname-spoofing
- **CORS**: dynamische origin-functie die alle subdomeinen van `BASE_DOMAIN` toestaat
- **Cookies**: localhost → geen domain; productie → `.inspexi.nl` (gedeeld)

### TenantContext Interface

```typescript
interface TenantContext {
  slug: string | null;
  organization: Organization | null;
  orgId: string | null;
  isSuperuserDomain: boolean;
}
```

### Decorators

- `@Public()` — Route overslaat JWT auth
- `@Roles(Role.ORG_ADMIN)` — Vereist minimale rol
- `@CurrentUser()` — Injecteert User uit JWT
- `@CurrentTenant()` — Injecteert TenantContext uit request

### API Response Format

```json
{ "success": true, "data": { ... } }
{ "success": false, "message": "...", "statusCode": 400 }
```

### Modules (15)

auth, organizations, users, contacts, customer-groups, products, price-tables, requests, quote-templates, quotes, notifications, audit-log, tasks, documents, common

> Dit is de **pre-integratie kern**. Het inspectiedomein voegt ~45 modules toe (config + templates + uitvoering). Voor de **unified AssetNode-boom** (zie "Actuele status"): de tree-CRUD zit in module **`asset-nodes`** (`AssetNodesService` + `TreeService`); de modules **`assets`** en **`inspection-locations`** zijn nu **compat-wrappers** die op `AssetNodesService` mappen (oude `assets`/`inspection-locations`-endpoints blijven werken tot de PWA-cutover). Uitvoeringsmodules (findings, visual-inspections, measurement-records, measurement-sheet-records, standalone-measurements, location-images) zijn op `assetNodeId` + `inspectionPlanId` herbedraad.

### Typische Module Structuur

```
src/modules/contacts/
├── contacts.controller.ts       # HTTP endpoints
├── contacts.service.ts          # Business logic + Prisma queries
├── contacts.service.spec.ts     # Unit tests
├── contacts.module.ts           # Module registratie
└── dto/                         # class-validator DTOs
```

**Grote modules zijn opgesplitst in per-resource/per-domein services** (allemaal geregistreerd in de eigen module; controller delegeert):
- `contacts/`: ContactsService + ContactAddressesService + ContactPersonsService + LocationsService (sub-services injecteren ContactsService voor de org-scoped findOne check)
- `quotes/`: QuotesService + QuoteApprovalsService + QuoteQuestionsService + QuoteAttachmentsService + QuotePdfService + QuotePublicService + DI-vrije helpers in `quotes.helpers.ts`
- `planning/`: PlanningService (core) + PlanningSessionsService + PlanningFollowersService + PlanningPublicService — dependency-richting altijd sub-service → core, nooit andersom

### Patterns

- **Soft deletes**: `isDeleted` boolean, queries filteren standaard op `false`
- **Per-org nummering**: `quoteNumber`, `projectNumber` en `workOrderNumber` zijn uniek per org (`@@unique([orgId, <veld>])`), niet globaal
- **FK org-validatie**: create/update endpoints die FK-UUID's accepteren valideren deze met `assertSameOrg(model, id, orgId, label)` / `assertAllSameOrg(...)` uit `@/common` vóór de schrijfactie (cross-tenant isolatie)
- **Rate limiting**: globaal 120 req/min per IP via `@nestjs/throttler` (`AppThrottlerGuard`); auth- en publieke routes strenger via `@Throttle({ default: { limit: N, ttl: 60000 } })`
- **iCal-token rotatie**: `POST /users/me/rotate-ical-token` genereert een nieuw feed-token (oude URL direct ongeldig); feed-toegang wordt gelogd
- **Audit trail**: Prisma `$use` middleware in `prisma.service.ts` vangt CREATE/UPDATE/DELETE automatisch op voor 14 modellen. `AuditContextInterceptor` zet userId/orgId/ip in `AsyncLocalStorage` (`requestContext`). `writeAuditLog()` gebruikt `$executeRaw` om recursieve middleware te voorkomen. Fire-and-forget (Logger.error bij falen, blokkeert operatie niet).
- **Audit UUID-resolutie**: `audit-log.service.ts` bevat `FK_FIELD_RESOLVERS` die UUID FK-waarden (contactId, ownerId, assignedTo, etc.) batch-resolven naar leesbare namen (bedrijfsnaam, voor+achternaam, adres, etc.) voordat ze naar de frontend gestuurd worden.
- **Swagger docs**: beschikbaar op `/api/docs`
- **Validation**: `ValidationPipe` met `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`
- **Route volgorde in NestJS controllers**: Specifieke routes (bijv. `GET :id/users`) moeten **vóór** generieke param routes (`GET :id`) staan om conflicten te voorkomen
- **Entity Name Enrichment**: Services (tasks, documents) gebruiken `enrichWithEntityNames()` — batch-lookup per entityType (Contact, Request, Quote, Product, Task) → `Map<entityId, displayName>` → voegt `entityName` veld toe aan response. Contact: bedrijfsnaam of "voornaam achternaam"; Request: titel; Quote: offertenummer; Task: titel
- **Notification dispatch bij upload/toewijzing**: Asynchroon (fire-and-forget), ontvangers worden bepaald op basis van entity eigenaarschap, creator wordt uitgesloten

### Shared API Utilities (`apps/api/src/common/utils/`)

Gebruik deze helpers in **alle** services — geen inline skip/take/count, org-scope ifs of not-found checks meer:

- `paginate<T>(model, { where, include, select, orderBy, page, limit })` → `Promise<{ data, total, page, limit }>` — vervangt het `Promise.all([findMany, count])` patroon. Voorbeeld: `return paginate(this.prisma.task, { where, include, orderBy, page, limit });`
- `buildOrderBy(sortBy, sortOrder, allowedFields, defaultOrderBy?)` — bouwt veilige orderBy uit user input; onbekende velden vallen terug op default (`{ createdAt: 'desc' }`). Let op: kan geen array-orderBy uitdrukken (price-tables/planning houden eigen orderBy)
- `orgScope(user)` → `{ orgId?: string }` — SUPERUSER (orgId null) krijgt `{}` (geen filter), anders `{ orgId: user.orgId }`. Spread in where: `{ ...orgScope(user), isDeleted: false }`
- `assertFound(entity, 'Relatie')` → returnt entity of gooit `NotFoundException('Relatie niet gevonden')` (NL melding)

Alles geëxporteerd via `@/common` (`src/common/index.ts` → `utils/index.ts`). **`isDeleted: false` blijft expliciet per query** — er is GEEN soft-delete middleware; deze filters nooit verwijderen.

### Storage Abstractielaag

**Locatie:** `apps/api/src/common/services/storage/`

- `StorageProvider` interface: `upload(key, buffer, mimeType)`, `download(key)`, `delete(key)`, `exists(key)`
- `LocalStorageProvider`: implementatie met `fs/promises`, configurable via `UPLOAD_DIR` env var (default: `./uploads`)
- `StorageModule`: `@Global()` module met injection token `STORAGE_PROVIDER` — later te swappen naar S3/Azure/GCS
- Storage key patroon: `{orgId}/{uuid}-{filename}`

### Documents Module

**Locatie:** `apps/api/src/modules/documents/`

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `POST /documents` | Upload | Multipart form, 25MB max, MIME whitelist |
| `GET /documents` | Lijst | Filters: search, entityType, entityId, onlyMine, page/limit |
| `GET /documents/:id` | Metadata | Org-scoped |
| `GET /documents/:id/download` | Download | Streamt buffer met Content-Type/Disposition headers |
| `PATCH /documents/:id` | Update | Description bijwerken |
| `DELETE /documents/:id` | Verwijder | Soft-delete |

**MIME Validator**: Custom `MimeTypeValidator extends FileValidator` — checkt `file.mimetype` (multer) i.p.v. magic bytes. NestJS built-in `FileTypeValidator` gebruikt `file-type` library die CSV/SVG/plain-text afwijst vanwege ontbrekende magic bytes.

**Toegestane types**: PDF, JPEG, PNG, SVG, WebP, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), CSV, ZIP

### Test Seed Script

**Locatie:** `apps/api/scripts/seed-test-documents.sh`

Bash script dat dummy documenten (PDF, PNG, CSV, SVG, DOCX, XLSX) genereert en uploadt via de API. Vereist draaiende API + seed data. DOCX/XLSX worden als Office Open XML (ZIP) gecreëerd via python3 `zipfile`. Gebruik: `bash apps/api/scripts/seed-test-documents.sh`

## Frontend Architectuur

### Provider Volgorde (main.tsx)

```tsx
<TenantProvider>      {/* Subdomain detectie, org branding fetch */}
  <AuthProvider>      {/* JWT auth state, login/logout */}
    <ToastProvider>   {/* UI notificaties */}
      <App />         {/* Routes */}
    </ToastProvider>
  </AuthProvider>
</TenantProvider>
```

### TenantProvider

- `getTenantInfo()` extraheert slug uit `window.location.hostname`
- Fetcht org branding via `GET /api/v1/organizations/by-slug/:slug`
- `applyOrgTheme(hex)` converteert hex → HSL, zet CSS vars `--color-primary-{50..900}`
- Navigatie tussen orgs via `window.location.href` (full page redirect voor cross-domain)

### AuthProvider

- Access token in memory (niet localStorage)
- Refresh token als httpOnly cookie
- Auto-refresh bij mount
- `login()`, `logout()`, `refreshUser()`

### API Client (`lib/api-client.ts`)

- Fetch-based met JWT auth header
- Unwrapt `{ success, data }` response automatisch
- Auto-redirect naar `/login` bij 401 na refresh poging
- Ondersteunt GET, POST, PATCH, PUT, DELETE, upload (FormData)

### Routing (App.tsx)

- Publiek: `/login`, `/invite/:token`
- Protected (AppLayout): `/dashboard`, `/users`, `/contacts/*`, `/requests/*`, `/quotes/*`, `/tasks/*`, `/documents`, `/products`, `/price-tables/*`, `/notifications`, `/organizations/*`, `/organization/settings`, `/profile`
- Alle pagina's lazy-loaded met `React.lazy()` + `Suspense`

### Org Switcher

- Alleen zichtbaar voor SUPERUSER
- Dropdown in sidebar, toont alle organisaties
- Navigeert via `window.location.href` naar `{slug}.{baseDomain}:{port}`

### UI Component Patterns

**Componenten (`components/ui/`)**: Button, Input, Select, Badge, Checkbox, Table, Modal, Card, Spinner, ToastProvider/useToast. Allemaal custom Tailwind — geen externe component library.

### Shared Portal Lib & Components (verplicht gebruiken — geen lokale duplicaten)

**`lib/format.ts`** — alle datum/valuta/bestandsgrootte formatting; null/undefined → `'—'`:
- `formatDate(value)` → "8 juni 2026", `formatShortDate(value)` → "08-06-2026", `formatDateTime(value)` → datum + tijd
- `formatCurrency(value)` → "€ 1.234,56" (Intl nl-NL EUR), `formatFileSize(bytes)` → "2,4 MB"

**`lib/storage.ts`** — `tenantStorage.getItem/setItem/removeItem`: tenant-scoped localStorage wrapper die keys prefixt met `inspexi:${slug}:` (superuser-domein → `mijn`). **Altijd gebruiken i.p.v. `localStorage`** voor UI-voorkeuren (tabel-config, sidebar-state, filters). Keys zijn bare names ('filter-mine:tasks', 'sidebar-state') — de wrapper prefixt zelf.

**`lib/status.ts`** — canonieke status-mappings, NOOIT lokaal opnieuw definiëren:
- `StatusMap = Record<string, { label, classes }>`; `getStatusConfig(map, value)` met grijze fallback voor onbekende waarden
- Maps: `TASK_STATUS`, `TASK_TYPE`, `REQUEST_STATUS`, `PRIORITY`, `QUOTE_STATUS`, `APPROVAL_STATUS`, `PLANNING_STATUS`, `SESSION_STATUS`, `ACCEPTANCE_STATUS`, `WORK_ORDER_STATUS`, `PROJECT_STATUS`, `LOG_TYPE`, `ERROR_REPORT_STATUS`, `CONTACT_TYPE`, `AUDIT_ACTION` + `REQUEST_SOURCE_LABELS`, `ENTITY_TYPE_LABELS`

**Shared UI (via `@/components/ui` barrel)**:
- `<StatusBadge map={QUOTE_STATUS} status={quote.status} />` — status-pill op basis van `lib/status.ts` (prop heet `status`, niet `value`)
- `<ErrorBox>foutmelding</ErrorBox>` — rode error-box (vervangt lokale `bg-danger-50` divs)
- `<InfoField label="..." value={...} />` — lees-modus veld op detailpagina's (dt/dd, `'—'` fallback)
- `<Tabs tabs={TabDef[]} active={tab} onChange={setTab} />` — `TabDef = { key, label, count?, icon? }`
- `useConfirm()` — promise-based confirm-modal: `const confirmed = await confirm({ title, message, confirmLabel })`. **NOOIT `window.confirm`**. `ConfirmProvider` staat in `main.tsx`
- `<PageHeader title="..." description="..." actions={...} />` (`components/layout/page-header.tsx`) — header van elke overzichtspagina

**DetailPageLayout** (`components/layout/detail-page-layout.tsx`):
- Props: `children` (main content) + `sidebar?` (ReactNode)
- Collapsible sidebar met toggle-knop, status persisted per route in localStorage (`inspexi:sidebar-state`)
- Wordt gebruikt op **alle** detail- en overzichtspagina's

**TableConfigSidebar** (`components/table-config/`):
- Exports: `TableConfigSidebar`, `useTableConfig` hook, `ColumnDef<T>` type
- `ColumnDef<T>` ondersteunt: `pinned` (start/end), `filterable`, `filterType` (text/select/date/boolean), `groupable`, `getFilterValue`, `sidebarLabel`
- `useTableConfig({ pageKey, columns })` → returns `activeColumns`, `filteredData()`, pending state + apply/reset functies
- Config wordt opgeslagen in localStorage per `pageKey`

**AuditHistory** (`components/audit-history/audit-history.tsx`):
- Props: `entityType` (string) + `entityId` (string | undefined)
- Toont in sidebar: actie-badges (groen/blauw/rood), veldwijzigingen (van→naar), gebruikersnaam, relatieve timestamps
- Paginering (10 per pagina), verbergt interne velden (`id`, `orgId`)
- Backend resolvet UUID FK-waarden naar leesbare namen; frontend toont `(verwijderd)` voor niet-opgeloste UUIDs
- Ondersteuning bestanden: `lib/audit-field-labels.ts` (Nederlandse veldnamen per entityType), `lib/audit-value-format.ts` (enum→label, boolean→Ja/Nee, datum→nl-NL, valuta→EUR, UUID→fallback)

### Sidebar Navigatie (`components/layout/sidebar.tsx`)

- `navItems[]` array met `to`, `label`, `icon`, `roles?`, `children?`
- Rol-gebaseerde filtering: items zonder `roles` zijn voor iedereen; met `roles` alleen voor die rollen
- Rolgroepen: `adminRoles = [SUPERUSER, ORG_ADMIN]`, `crmRoles = [SUPERUSER, ORG_ADMIN, MANAGER, BACKOFFICE, WERKVOORBEREIDER]`
- Submenu's tonen automatisch wanneer parent-route actief is
- User info panel onderaan met initialen-avatar en rol-badge

### Document Preview Modal (`components/documents/document-preview-modal.tsx`)

Grote modal (85vh, max-w-6xl) met preview area + metadata sidebar:

- **Authenticated blob fetching**: `fetch()` met Bearer token → blob → `URL.createObjectURL()` → cleanup met `revokeObjectURL()` bij sluiten
- **Pluggable renderers per MIME type**:
  - `ImagePreview` — `<img>` met object-contain
  - `PdfPreview` — `<iframe>` met blob URL
  - `CsvPreview` — Custom CSV parser (detecteert `;` vs `,` separator), rendert als HTML tabel (max 100 rijen)
  - `DocxPreview` — `docx-preview` library (`renderAsync()` naar container div)
  - `XlsxPreview` — `xlsx` SheetJS (`XLSX.read()` + `sheet_to_html()`), tab-navigatie bij meerdere werkbladen
  - `NoPreview` — Fallback voor niet-ondersteunde formaten (PowerPoint, ZIP, .doc, etc.)
- **Metadata sidebar**: bestandsnaam, type, grootte, eigenaar, datum, beschrijving, entity koppeling, download knop

### DocumentsSection (`components/documents/documents-section.tsx`)

Herbruikbaar component voor documenten per entiteit. Props: `entityType`, `entityId`, `canUpload`.
Wordt gebruikt op: contact detail, aanvraag detail, offerte detail, taak detail pagina's.
Bevat: upload knop (→ `UploadDocumentModal`), documenten lijst met preview/download/delete, `DocumentPreviewModal`.

### Authenticated Download (`lib/download-file.ts`)

Utility voor authenticated file downloads: fetch met Bearer token → blob → tijdelijke `<a>` link met `URL.createObjectURL()` → `click()` → `revokeObjectURL()`.

### Kanban Board (`pages/requests/components/requests-kanban.tsx`)

Drag-and-drop Kanban voor aanvragen met 6 statuskolommen. Gebruikt **optimistic UI updates**:
1. Lokale state override bij drag
2. Server mutatie asynchroon
3. Rollback bij error, server data neemt over bij success
4. `dragCounter` ref patroon voor correcte handling van geneste drag events

### Overzichtspagina Patroon

Elke overzichtspagina volgt hetzelfde patroon:
1. `DetailPageLayout` met `TableConfigSidebar` in sidebar
2. `ColumnDef<T>[]` definities met pinned/filterable kolommen
3. `useTableConfig({ pageKey, columns })` hook
4. `Table` component met `activeColumns` en `filteredData(data)`
5. Header met titel + "Nieuw" button → opent `CreateXxxModal`

### Detail Pagina Patroon

1. `useParams()` voor ID, `useXxx(id!)` query hook
2. `DetailPageLayout` met `AuditHistory` in sidebar
3. Terugknop naar overzichtspagina
4. Tab-navigatie met `useState<Tab>('eerste-tab')`
5. Tabs: "Overzicht" (inline bewerkbaar), domeinspecifiek, "Instellingen" (gevarenzone)
6. react-hook-form + zod voor bewerkformulieren

### Inline Editing Patroon (Overzicht-tab)

De Overzicht-tab van elke detailpagina moet **inline bewerkbaar** zijn. Referentie: `contact-detail-page.tsx`.

**State + form setup:**
```tsx
const [isEditing, setIsEditing] = useState(false);
const { register, handleSubmit, reset: resetForm, formState: { errors, isDirty } } = useForm<FormData>({
  resolver: zodResolver(schema),
});

// Populate form when data loads
useEffect(() => {
  if (entity) {
    resetForm({ title: entity.title || '', /* ... */ });
  }
}, [entity, resetForm]);
```

**Lees-modus** → `InfoField` componenten in een `<Card>`:
```tsx
function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}
```

**Bewerk-knop** in de Card header (alleen bij `canWrite`):
```tsx
<Button variant="secondary" onClick={() => setIsEditing(true)}>Bewerken</Button>
```

**Bewerk-modus** → form met `Input`/`Select`/`textarea` in een `<Card>`:
- "Opslaan" knop: `disabled={!isDirty}` + `isLoading={isUpdating}`
- "Annuleren" knop: reset form + `setIsEditing(false)`

**Belangrijk**: Geen apart "Instellingen"-tab voor bewerken — bewerken zit in het Overzicht-tab. Het Instellingen-tab bevat alleen de gevarenzone (verwijderen).

### Dropdown Data Laden — Gebruik Bestaande Hooks

**NOOIT `apiClient.get()` met `useEffect` gebruiken** voor het laden van dropdown data. Gebruik altijd bestaande query hooks:

```tsx
// ✅ GOED — hergebruik bestaande hook
import { useUsers } from '@/pages/users/hooks/use-users';
const { data: allUsers } = useUsers();
// allUsers is User[] (flat array)

// ❌ FOUT — handmatige fetch met verkeerde response shape
const [users, setUsers] = useState([]);
useEffect(() => {
  apiClient.get<{ data: any[] }>('/users?limit=200')  // FOUT: users retourneert flat array
    .then((res) => setUsers(res.data.map(...)))        // FOUT: res IS al de array
}, []);
```

**API response shapes na apiClient unwrap:**
- `GET /users` → `User[]` (flat array, GEEN paginatie)
- `GET /contacts` → `{ data: Contact[], total, page, limit }` (gepagineerd)
- `GET /requests` → `{ data: Request[], total, page, limit }` (gepagineerd)
- `GET /quotes` → `{ data: Quote[], total, page, limit }` (gepagineerd)
- `GET /planning` → `{ data: PlanningItem[], total, page, limit }` (gepagineerd — `planning.service.findAll` gebruikt `paginate()`)
- `GET /products` → `{ data: Product[], total, page, limit }` (gepagineerd)

### Hooks Patroon (per pagina-domein)

```
pages/{domein}/hooks/use-{resource}.ts
```

Standaard hooks per resource:
- `useXxxs()` — `GET /{resource}` list query
- `useXxx(id)` — `GET /{resource}/:id` detail query
- `useCreateXxx()` — `POST /{resource}` mutatie + invalidate list
- `useUpdateXxx(id)` — `PATCH /{resource}/:id` mutatie + invalidate list+detail
- `useDeleteXxx(id)` — `DELETE /{resource}/:id` mutatie + invalidate list

Alle hooks gebruiken `apiClient` + TanStack Query (`useQuery`/`useMutation` + `queryClient.invalidateQueries`)

Extra hooks patroon voor documenten:
- `useDocuments(params)` — GET /documents (search, entityType, entityId, onlyMine, page, limit)
- `useEntityDocuments(entityType, entityId)` — shorthand voor documenten per entiteit
- `useUploadDocument()` — POST met FormData via `apiClient.upload()` + invalidate `['documents']`

Extra hooks patroon voor organisatie-instellingen:
- `useOrganization(orgId)`, `useUpdateOrganization(orgId)`, `useUploadLogo(orgId)`, `useDeleteLogo(orgId)`

## Testen

### Unit Tests (API)

```bash
cd apps/api
pnpm test                     # 587 tests, 36 suites
pnpm test:watch               # Watch mode
pnpm test:cov                 # Met coverage
```

- Config: `jest.config.ts`
- Patroon: `**/*.spec.ts` in `src/`
- Path alias: `@/` → `src/`

### E2E Tests (API)

```bash
cd apps/api
pnpm test:e2e                 # 154 tests, 13 suites
```

- Config: `test/jest-e2e.json`
- **MaxWorkers: 1** (serieel)
- Gebruikt echte database (seed data + eigen test fixtures)
- Suites: auth, contacts, cross-tenant, documents, notifications, organizations, price-tables, products, quote-templates, quotes, requests, tasks, users
- `cross-tenant.e2e-spec.ts`: cross-tenant FK-aanvallen (org A injecteert org B's UUIDs in planning/taken/contacten create+update) → moeten 403 geven; test de service-laag `assertSameOrg`/`assertAllSameOrg` checks

### Belangrijk bij E2E Tests

- Test users beginnen met `e2e-` prefix in email
- `afterAll` moet in volgorde opruimen: `auditLog` → `invitation` → `refreshToken` → `user` → `organization` (FK constraints)
- Slugs mogen **geen hyphens** bevatten (regex: `/^[a-z0-9]+$/`)
- Tests draaien op `127.0.0.1` (classified als `unknown` host) — TenantGuard laat alles door (alleen wanneer `BASE_DOMAIN = localhost`; anders fail-secure)
- `afterAll`-cleanup altijd in `try/finally` met `app.close()` in de finally — anders blijft jest hangen op open handles bij een gefaalde cleanup
- Nooit twee E2E-runs tegelijk (gedeelde database); leftover fixtures na een gekillde run opruimen met `pnpm prisma:seed`

### Frontend Tests

```bash
cd apps/portal
pnpm test                     # Vitest
pnpm test:watch               # Watch mode
```

## Environment Variabelen

Zie `apps/api/.env.example`:

```env
DATABASE_URL=postgresql://inspectie:inspectie_dev_password@localhost:5433/inspectie?schema=public
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=30d
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=noreply@yourdomain.nl
PUBLIC_URL=http://localhost:5173
API_PORT=3000
BASE_DOMAIN=localhost
PORTAL_PORT=5173
SUPERUSER_SUBDOMAIN=mijn
UPLOAD_DIR=./uploads
ANTHROPIC_API_KEY=            # gedeeld door voice-parsing én AI-review; leeg = AI-functies uit
ANTHROPIC_MODEL=claude-sonnet-4-6         # voice-parsing
ANTHROPIC_REVIEW_MODEL=claude-sonnet-4-6  # AI-voorcontrole (PRD-13)
```

## Seed Data

Alle wachtwoorden: `Password123!`

| Email | Rol | Organisatie |
|---|---|---|
| superuser@inspexi.nl | SUPERUSER | — |
| admin@inspexi-demo.nl | ORG_ADMIN | InspeXi Demo (`inspexidemo`) |
| manager@inspexi-demo.nl | MANAGER | InspeXi Demo |
| backoffice@inspexi-demo.nl | BACKOFFICE | InspeXi Demo |
| werkvoorbereider@inspexi-demo.nl | WERKVOORBEREIDER | InspeXi Demo |
| inspecteur@inspexi-demo.nl | INSPECTEUR | InspeXi Demo |
| admin@testbedrijf.nl | ORG_ADMIN | Test Bedrijf (`testbedrijf`) |
| inspecteur@testbedrijf.nl | INSPECTEUR | Test Bedrijf |

Seed bevat ook: contacten, adressen, locaties, producten, prijstabellen, aanvragen, offerte-templates, offertes, notificaties.

## Seed Script Opruimvolgorde

Bij het toevoegen van nieuwe modellen met FK relaties naar bestaande modellen, **moet** `prisma/seed.ts` bijgewerkt worden. De cleanup volgorde (kinderen eerst):

```
document → task
notificationGroupPref → notificationPref → notification
quoteApprovalRequest → quoteLine → quote → quoteTemplate
priceTier → priceTableItem → contactPriceTable → priceTable → product
requestStatusHistory → request
contactCustomerGroup → customerGroup → contactPerson → contactEmail → contactLog → location → contactAddress → contact
availabilityException → userScheduleAssignment → availabilityTemplateSlot → availabilityTemplate
auditLog → invitation → refreshToken → user → organization
```

> Beschikbaarheid (PRD-12): `availabilityException` en `userScheduleAssignment` refereren `user` (via `userId` én `createdById`) en moeten dus **vóór** `user` opgeruimd worden; `availabilityTemplateSlot` cascadeert op `availabilityTemplate`, maar ruim ze expliciet vóór de template op.

**AssetNode-boom (let op de RESTRICT-FK's):** uitvoeringsrecords cascaden op `assetNodeId`, maar twee referrers RESTRICTen op de node-FK en moeten **vóór** `assetNode` opgeruimd worden: **`inspectionPlanLocation`** (scope-rijen) en **`standaloneMeasurement`** (+ `standaloneMeasurementValue` ervoor). `AssetNode.parentId` is `SET NULL`, dus één `assetNode.deleteMany()` ruimt de hele (zelf-refererende) boom op — geen kinderen-vóór-ouders-loop nodig. `LocationImage` heeft `nodeId` (Cascade) en `LocationImageMarker.assetNodeId` (SetNull). Volgorde, kinderen eerst:
```
locationImageMarker → standaloneMeasurementValue → standaloneMeasurement → locationImage
finding → measurementRecord → visualInspection → measurementSheetRecord
inspectionPlanLocation → assetNode → inspectionPlan
```

**AI-review (PRD-13):** `aiReviewItem` cascadeert op `aiReviewRun`; de run cascadeert op `inspectionPlan` en heeft SetNull-FK's naar `user` (triggeredBy/checkedBy), `finding`/`assetNode` en `generatedDocument`. Ruim expliciet op, **vóór** de inspectieplan-/finding-/user-cleanup:
```
aiReviewItem → aiReviewRun
```

## Veelvoorkomende Taken

### Nieuw API Module Toevoegen

1. Maak module map: `src/modules/{naam}/`
2. Bestanden: `{naam}.controller.ts`, `{naam}.service.ts`, `{naam}.module.ts`, `dto/`
3. Registreer in `app.module.ts` imports
4. Voeg tenant filtering toe aan alle queries: `WHERE orgId = user.orgId`
5. Gebruik `@Roles()` decorator voor autorisatie
6. Voeg `@ApiTags()` en `@ApiOperation()` toe voor Swagger
7. Schrijf unit tests (`.spec.ts`) en E2E tests

### Nieuw Prisma Model Toevoegen

1. Voeg model toe aan `prisma/schema.prisma` met `@@map("imp_{tabel}")` prefix
2. **Voer migratie uit vanuit `apps/api/`**: `cd apps/api && npx prisma migrate dev --name add-{model}` (vanuit root werkt niet)
3. Update `prisma/seed.ts`: voeg `deleteMany()` toe in juiste volgorde + seed data
4. Update `apps/portal/src/types/index.ts` met TypeScript interface
5. Bij FK naar User: voeg `auditLog.deleteMany()` toe in E2E test teardown
6. Wil je audit trail? Voeg model toe aan `AUDITED_MODELS` Set in `prisma.service.ts` + `MODEL_TABLE_MAP` + eventueel FK resolvers in `audit-log.service.ts`

### Nieuw Frontend Pagina Toevoegen

1. Maak pagina in `src/pages/{domein}/{naam}-page.tsx`
2. Voeg lazy import toe in `App.tsx`
3. Voeg route toe onder `<Route element={<AppLayout />}>`
4. Voeg navigatie-item toe in `sidebar.tsx` (let op rol-gebaseerde zichtbaarheid via `roles` prop)
5. Maak hooks aan in `pages/{domein}/hooks/use-{resource}.ts`
6. **Overzichtspagina**: gebruik `DetailPageLayout` + `TableConfigSidebar` + `useTableConfig` + `ColumnDef<T>[]`
7. **Detailpagina**: gebruik `DetailPageLayout` + `AuditHistory` sidebar + tab-navigatie + react-hook-form/zod
8. **Modal**: gebruik `Modal` component + react-hook-form/zod + `useCreateXxx()` mutatie

### Audit Trail Uitbreiden voor Nieuw Model

1. Voeg model toe aan `AUDITED_MODELS` en `MODEL_TABLE_MAP` in `prisma.service.ts`
2. Als model FK-velden heeft: voeg resolvers toe aan `FK_FIELD_RESOLVERS` in `audit-log.service.ts`
3. Voeg model toe aan `ALLOWED_ENTITY_TYPES` in `audit-log.service.ts`
4. Voeg Nederlandse veldlabels toe in `apps/portal/src/lib/audit-field-labels.ts`
5. Voeg enum labels toe in `apps/portal/src/lib/audit-value-format.ts` (indien nieuwe enums)
6. Voeg `<AuditHistory entityType="{ModelNaam}" entityId={id} />` toe aan detailpagina sidebar

## Dev URLs

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api/docs`
- Portal: `http://localhost:5173`
- Portal (SUPERUSER): `http://mijn.localhost:5173`
- Portal (org): `http://inspexidemo.localhost:5173`
- Prisma Studio: `npx prisma studio` (poort 5555)
- Database: `localhost:5433` (PostgreSQL)

## Recente Commit Geschiedenis

Commits volgen het patroon: `feat: implement PRD-{nr} — {beschrijving}`

1. PRD-01: Foundation — auth, multi-tenant & user management
2. PRD-02: CRM — relaties, locaties & contactgeschiedenis
3. PRD-04: Producten, prijstabellen & staffelprijzen
4. PRD-03: Leads & aanvragen met statusflow en historie
5. PRD-05: Offertes core met prijscalculatie, goedkeuringsflow en portal UI
6. PRD-06: Notificatiesysteem met in-app, email & voorkeursbeheer
7. Contactpersonen, klantgroepen, audit trail, sessiebeheer & tabel-configuratie
8. Multi-tenant subdomein support, taken module, organisatiebeheer
9. Taken uitbreidingen, documentbeheer met preview, organisatie-instellingen & kanban view

## Bekende Conventies

- Slug regex: `/^[a-z0-9]+$/` — **geen hyphens** toegestaan
- API prefix: `/api/v1`
- Alle API responses gewrapped in `{ success, data }` of `{ success: false, message }`
- Cookie domain: dev = geen domain (per-subdomain isolatie), productie = `.inspexi.nl`
- Vite dev server: `host: true` + `changeOrigin: false` (behoudt originele Host header)
- Frontend navigatie tussen orgs: `window.location.href` (full page redirect)
- Pagination: optioneel, via query params `page`, `limit`, `sortBy`, `sortOrder`
- **"Mijn X" filter patroon**: Checkbox "Mijn taken" / "Mijn documenten" → `onlyMine` boolean state → query param → backend filtert op `uploadedById = user.id` of `assignedToId = user.id`
- **Auto-slug in modals**: slug wordt automatisch afgeleid van naam (lowercase, strip non-alphanumeric) met `slugTouched` state flag — stopt zodra gebruiker slug handmatig bewerkt
- **Geen delete voor organisaties**: te destructief (cascade over alle tenant-data); eventueel later via soft-delete
- **Grote pagina's splitsen**: detailpagina's blijven `export default function` op het originele pad (React.lazy); secties/tabs/modals gaan naar een co-located `components/` map naast de pagina. Data via props doorgeven — extracted components fetchen niet opnieuw

## Bekende Gotchas

- **Prisma migrate moet vanuit `apps/api/` draaien**, niet vanuit de root — anders "Could not find Prisma Schema"
- **NOOIT `prisma db push` gebruiken** — altijd `npx prisma migrate dev --name <naam>`. `db push` wijzigt de database zonder migratiebestand; de migratieketen herspeelt dan niet meer op een lege/shadow-database (P3006) en elke volgende `migrate dev` blokkeert. Dit is in juni 2026 eenmalig hersteld met een repair-migratie (`20260612230000_repair_db_push_drift`) — niet opnieuw laten ontstaan
- **Dev server port conflict**: bij herstarten altijd eerst `lsof -ti:3001 -ti:5173 | xargs kill -9`
- **NestJS route volgorde**: specifieke routes (`GET :id/users`) moeten vóór parameterized routes (`GET :id`) in de controller staan
- **AssetNode = persistent & plan-ontkoppeld**: assets/locaties leven nu in de unified **`AssetNode`**-boom, **niet meer onder een inspectieplan**. Een asset hoort bij een CRM-Locatie-boom (via de wortel-node) en is herbruikbaar over plannen heen; een plan refereert ernaar via `InspectionPlan.locationId` (hoofdlocatie) + `InspectionPlanLocation` (scope). Een asset/finding "vanuit een inspectie" aanmaken vereist daarom dat het plan een `locationId` heeft én dat de node in díe boom zit (`rootLocationId === plan.locationId`, zie `assertNodeInPlanTree`) → anders 400/404. Uitvoeringsrecords krijgen `inspectionPlanId` **in de body** (niet meer afgeleid van de asset).
- **AssetNode `path`/`depth` komen van DB-triggers**: nooit zelf zetten; bij raw inserts (seed/tests) **parents vóór kinderen** aanmaken zodat de trigger het pad kan vullen. `move` doet een rauwe `parent_id`-UPDATE en laat de triggers het subtree-pad herschrijven.
- **sync-mapper op contract v3**: de `/sync`-push voor het inspectiedomein is herbedraad op de AssetNode-boom (`assetNodes` + execution-entities met `assetNodeId`/`inspectionPlanId`). De **PWA** (`../Inspexi-App`) moet hier nog op cutoveren — tot die tijd is het v2-contract niet langer geldig voor assets/locaties (zie `docs/fase3/PWA-CUTOVER-ASSET-NODE.md`).
- **Audit middleware recursie**: `writeAuditLog()` gebruikt `$executeRaw` i.p.v. Prisma client om oneindige middleware-loop te voorkomen
- **SUPERUSER heeft geen orgId**: queries die `orgId` filteren moeten `null` toestaan voor SUPERUSER (zie `audit-log.service.ts`)
- **Build commando**: altijd `npx turbo run build` vanuit de root — dit bouwt beide packages en controleert TypeScript errors
- **API poort**: default is 3000 maar kan via `API_PORT` env var gewijzigd zijn (huidige dev setup draait soms op 3001)
- **curl requests naar API**: vereisen `Host: {slug}.localhost` header (bijv. `Host: inspexidemo.localhost`) vanwege TenantMiddleware. Zonder deze header krijg je "Gebruik het subdomein" error
- **Bash en speciale tekens**: `Password123!` bevat `!` wat bash history expansion triggert in double-quoted strings. Gebruik heredoc of single quotes
- **NestJS FileTypeValidator bug**: Built-in `FileTypeValidator` gebruikt `file-type` library (magic bytes) — weigert CSV, SVG, en plain-text bestanden. Gebruik custom `MimeTypeValidator` die `file.mimetype` (multer) checkt
- **apiClient.get() accepteert maar 1 argument**: `apiClient.get<T>(endpoint: string)` — query params moeten in de URL string zitten (bijv. `'/contacts?limit=200'`), NIET als tweede argument
- **API response shapes verschillen per endpoint**: Na apiClient unwrap (`{ success, data }` → `data`): `GET /users` retourneert een **flat array** `User[]`, terwijl `GET /contacts`, `GET /requests`, `GET /quotes` gepagineerde objecten `{ data: T[], total, page, limit }` retourneren. Controleer altijd de controller/service van het endpoint
- **Gebruik bestaande hooks voor dropdown data**: Gebruik `useUsers()` i.p.v. handmatige `apiClient.get` calls in `useEffect`. De hooks zijn al getypt en cachen automatisch via TanStack Query
- **NestJS controller @Controller prefix**: Gebruik ALLEEN de resource naam (bijv. `@Controller('projects')`), NIET het volledige pad (`@Controller('api/v1/projects')`) — het globale prefix `/api/v1` wordt automatisch toegevoegd
- **Detail pagina's moeten inline bewerkbaar zijn**: Het Overzicht-tab moet altijd een "Bewerken" knop hebben die wisselt tussen lees-modus (InfoField) en bewerk-modus (form). Zie `contact-detail-page.tsx` als referentie. Geen apart "Instellingen"-tab voor bewerken
- **Beschikbaarheid — GEBLOKKEERD wint altijd** (PRD-12): in de resolutie geldt de precedentie **GEBLOKKEERD > BESCHIKBAAR > baseline**; een GEBLOKKEERD-uitzondering snijdt altijd uit de beschikbaarheid. **Freelancers (en users zonder dienstvorm) zijn standaard NIET beschikbaar** — alleen DIENSTVERBAND met een geldig weekschema levert een baseline; freelancers moeten hun beschikbaarheid expliciet met `BESCHIKBAAR`-uitzonderingen opbouwen
- **Planning-assign geeft 409 met warnings bij onbeschikbaarheid** (PRD-12 §12.9): `POST /planning/:id/assign` (en de sessie-variant + het verzetten via `PATCH`) checkt vóór het wegschrijven of de inspecteur op de geplande dag beschikbaar is (dag-niveau: som resolved intervallen ≥ `durationHours×60`, of ≥ 1 minuut zonder duur). Bij conflict → **409** met body `{ success:false, message, warnings:[{ userId, name, date, reason }] }` (de exception-filter geeft `warnings` door). Override met **`overrideAvailabilityWarnings: true`** in de body → toegewezen + een `PlanningHistory`-record met action `AVAILABILITY_OVERRIDE`. Portal leest `warnings` via `ApiClientError.data` en toont een `useConfirm`-dialoog (helper `useAvailabilityOverride`). Zonder `scheduledDate` (NOG_TE_PLANNEN) → geen check
- **Beschikbaarheid ≠ chat-presence `Availability`**: het PRD-12-beschikbaarheidsdomein staat volledig los van de bestaande chat-presence-enum `Availability` (online/away/…); niet verwarren of samenvoegen
