# InspeXi Beheer — Claude Context

Multi-tenant inspectie-managementplatform (CRM, leads, offertes, taken, documenten).
Monorepo met **NestJS API** + **React Portal**, Turbo + pnpm workspaces.

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
│   │   └── test/             # 9 E2E test suites
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

### Typische Module Structuur

```
src/modules/contacts/
├── contacts.controller.ts       # HTTP endpoints
├── contacts.service.ts          # Business logic + Prisma queries
├── contacts.service.spec.ts     # Unit tests
├── contacts.module.ts           # Module registratie
└── dto/                         # class-validator DTOs
```

### Patterns

- **Soft deletes**: `isDeleted` boolean, queries filteren standaard op `false`
- **Audit trail**: Prisma `$use` middleware in `prisma.service.ts` vangt CREATE/UPDATE/DELETE automatisch op voor 14 modellen. `AuditContextInterceptor` zet userId/orgId/ip in `AsyncLocalStorage` (`requestContext`). `writeAuditLog()` gebruikt `$executeRaw` om recursieve middleware te voorkomen. Fire-and-forget (Logger.error bij falen, blokkeert operatie niet).
- **Audit UUID-resolutie**: `audit-log.service.ts` bevat `FK_FIELD_RESOLVERS` die UUID FK-waarden (contactId, ownerId, assignedTo, etc.) batch-resolven naar leesbare namen (bedrijfsnaam, voor+achternaam, adres, etc.) voordat ze naar de frontend gestuurd worden.
- **Swagger docs**: beschikbaar op `/api/docs`
- **Validation**: `ValidationPipe` met `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`
- **Route volgorde in NestJS controllers**: Specifieke routes (bijv. `GET :id/users`) moeten **vóór** generieke param routes (`GET :id`) staan om conflicten te voorkomen
- **Entity Name Enrichment**: Services (tasks, documents) gebruiken `enrichWithEntityNames()` — batch-lookup per entityType (Contact, Request, Quote, Product, Task) → `Map<entityId, displayName>` → voegt `entityName` veld toe aan response. Contact: bedrijfsnaam of "voornaam achternaam"; Request: titel; Quote: offertenummer; Task: titel
- **Notification dispatch bij upload/toewijzing**: Asynchroon (fire-and-forget), ontvangers worden bepaald op basis van entity eigenaarschap, creator wordt uitgesloten

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
5. Tabs: "Algemeen" (read-only Card), domeinspecifiek, "Instellingen" (bewerkformulier)
6. react-hook-form + zod voor bewerkformulieren

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
pnpm test                     # 163 tests
pnpm test:watch               # Watch mode
pnpm test:cov                 # Met coverage
```

- Config: `jest.config.ts`
- Patroon: `**/*.spec.ts` in `src/`
- Path alias: `@/` → `src/`

### E2E Tests (API)

```bash
cd apps/api
pnpm test:e2e                 # 107 tests, 9 suites
```

- Config: `test/jest-e2e.json`
- **MaxWorkers: 1** (serieel)
- Gebruikt echte database (seed data + eigen test fixtures)
- Suites: auth, contacts, organizations, price-tables, products, quote-templates, quotes, requests, users

### Belangrijk bij E2E Tests

- Test users beginnen met `e2e-` prefix in email
- `afterAll` moet in volgorde opruimen: `auditLog` → `invitation` → `refreshToken` → `user` → `organization` (FK constraints)
- Slugs mogen **geen hyphens** bevatten (regex: `/^[a-z0-9]+$/`)
- Tests draaien op `127.0.0.1` (classified als `unknown` host) — TenantGuard laat alles door

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
auditLog → invitation → refreshToken → user → organization
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

## Bekende Gotchas

- **Prisma migrate moet vanuit `apps/api/` draaien**, niet vanuit de root — anders "Could not find Prisma Schema"
- **Dev server port conflict**: bij herstarten altijd eerst `lsof -ti:3001 -ti:5173 | xargs kill -9`
- **NestJS route volgorde**: specifieke routes (`GET :id/users`) moeten vóór parameterized routes (`GET :id`) in de controller staan
- **Audit middleware recursie**: `writeAuditLog()` gebruikt `$executeRaw` i.p.v. Prisma client om oneindige middleware-loop te voorkomen
- **SUPERUSER heeft geen orgId**: queries die `orgId` filteren moeten `null` toestaan voor SUPERUSER (zie `audit-log.service.ts`)
- **Build commando**: altijd `npx turbo run build` vanuit de root — dit bouwt beide packages en controleert TypeScript errors
- **API poort**: default is 3000 maar kan via `API_PORT` env var gewijzigd zijn (huidige dev setup draait soms op 3001)
- **curl requests naar API**: vereisen `Host: {slug}.localhost` header (bijv. `Host: inspexidemo.localhost`) vanwege TenantMiddleware. Zonder deze header krijg je "Gebruik het subdomein" error
- **Bash en speciale tekens**: `Password123!` bevat `!` wat bash history expansion triggert in double-quoted strings. Gebruik heredoc of single quotes
- **NestJS FileTypeValidator bug**: Built-in `FileTypeValidator` gebruikt `file-type` library (magic bytes) — weigert CSV, SVG, en plain-text bestanden. Gebruik custom `MimeTypeValidator` die `file.mimetype` (multer) checkt
