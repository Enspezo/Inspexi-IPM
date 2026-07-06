# Soft-Delete Inventarisatie & Standaardisatie — Fase 1

> Achtergrond: [REVIEW-2026-07-AANBEVELINGEN.md](./REVIEW-2026-07-AANBEVELINGEN.md) sectie **A5, punt 20**.
> Branch: `refactor/soft-delete-standardization`. Deze fase levert **alleen** de
> inventarisatie, de gedragsfixes voor ontbrekende filters en het fundament
> (tombstone-opruimjob). De grootschalige `isDeleted → deletedAt`-migratie is
> **niet** uitgevoerd; zie het migratievoorstel (§4).

## 0. Samenvatting

De codebase kent twee soft-delete-mechanismen naast elkaar:

| Mechanisme | Betekenis | # modellen |
|---|---|---|
| `deletedAt DateTime?` | tombstone mét tijdstip (nodig voor sync + retentie) | 13 |
| `isDeleted Boolean` | vlag zonder tijdstip (legacy CRM) | 13 |
| **beide** (`isDeleted` + `deletedAt`) | dubbel geboekt | 3 |
| geen | immutable / audit / lookup / join-tabel | 123 |
| **Totaal modellen** | | **152** |

- **Kern-CRM** gebruikt overwegend `isDeleted` (geen audit-tijdstip).
- **Inspectiedomein** gebruikt `deletedAt` — verplicht voor de PWA-sync (tombstones) en voor retentie.
- **Doelstandaard (review A5 §20): `deletedAt`.** Fase 1 raakt het schema niet aan; §4 beschrijft de gefaseerde migratie.

De `/sync`-contract (v3, `apps/api/src/modules/sync/sync-mapper.ts`) omvat **7 entiteiten**, alle met `deletedAt`.

---

## 1. Per-model inventaris

### 1a. `deletedAt` (tombstone) — 13 modellen

| Model | Veld (schema.prisma) | Filterende service(s) | In `/sync`? |
|---|---|---|---|
| InspectionPlan | `deletedAt` :2675 | inspection-plans, asset-nodes, sync | **ja** |
| AssetNode | `deletedAt` :2751 | asset-nodes, assets, inspection-locations, sync | **ja** |
| Finding | `deletedAt` :2897 | findings, client-findings, assets, visual-inspections, measurement-records, sync | **ja** |
| VisualInspection | `deletedAt` :2813 | visual-inspections, assets, sync | **ja** |
| MeasurementRecord | `deletedAt` :2849 | measurement-records, assets, sync | **ja** |
| MeasurementSheetRecord | `deletedAt` :3797 | measurement-sheet-records, generated-documents, sync | **ja** |
| StandaloneMeasurement | `deletedAt` :3898 | standalone-measurements, sync | **ja** |
| Photo | `deletedAt` :2946 | photos, client-findings | nee (sync-adjacent) |
| NormTypeDefinition | `deletedAt` :2539 | norm-types | nee |
| AssetTypeDefinition | `deletedAt` :3273 | asset-types | nee |
| LocationTypeDefinition | `deletedAt` :3370 | location-types | nee |
| ChatThread | `deletedAt` :4288 | chat (threads) | nee (eigen chat-sync) |
| ChatMessage | `deletedAt` :4336 | chat (messages) | nee (eigen chat-sync) |

### 1b. `isDeleted` (legacy CRM-vlag) — 13 modellen

| Model | Veld (schema.prisma) | Filterende service(s) | In `/sync`? |
|---|---|---|---|
| Contact | `isDeleted` :752 | contacts, requests, quotes, documents, tasks, search, planning, projects | nee |
| ContactPerson | `isDeleted` :837 | contact-persons, projects, search, generation-context | nee |
| Request | `isDeleted` :1125 | requests, contacts, documents, tasks, search, planning | nee |
| CustomerGroup | `isDeleted` :807 | customer-groups | nee |
| ProductGroup | `isDeleted` :1019 | product-groups | nee |
| Document | `isDeleted` :1514 | documents, projects | nee |
| DocumentTag | `isDeleted` :1536 | document-tags | nee |
| Note | `isDeleted` :2046 | notes | nee |
| CustomFieldDefinition | `isDeleted` :1917 | custom-fields | nee |
| SupportTicket | `isDeleted` :4429 | support-tickets, documents | nee |
| InspectorCertificate | `isDeleted` :4503 | inspector-certificates | nee |
| MeasurementInstrument | `isDeleted` :4543 | measurement-instruments | nee |
| Calibration | `isDeleted` :4577 | measurement-instruments (via instrument) | nee |

### 1c. Beide velden (`isDeleted` + `deletedAt`) — 3 modellen

| Model | Velden | Canonieke filter in code | In `/sync`? |
|---|---|---|---|
| User | `isDeleted` :561 + `deletedAt` :562 | `isDeleted: false` (soft-delete zet beide + `isActive:false`, users.service:687) | nee |
| Project | `isDeleted` :1750 + `deletedAt` :1751 | `isDeleted: false` (soft-delete zet beide, projects.service:248) | nee |
| ProjectPhase | `isDeleted` :1832 + `deletedAt` :1833 | idem Project | nee |

> De "beide"-modellen zijn migratie-restanten: de code filtert consequent op
> `isDeleted`, maar `deletedAt` wordt bij delete óók gezet. Ze zijn daardoor al
> half klaar voor de doelstandaard.

### 1d. Geen soft-delete — 123 modellen

Immutable/append-only (`Report`, `Signature`, alle `*VersionHistory`), audit
(`AccessLog`), lookup/enum-tabellen (`*StatusType`, `*Option`, `*TypeDefinition`
zonder tombstone) en join-tabellen (`ContactCustomerGroup`, `InspectionPlanLocation`,
`ChecklistItemLink`, …). Deze worden hard verwijderd of nooit verwijderd; een
soft-delete-filter is niet van toepassing.

---

## 2. Ontbrekende soft-delete-filters

Methode: schema → soft-deletable modellen; daarna elke `findMany/findFirst/count`
en elk `include`/`select`/`_count` in `apps/api/src` gescand op een passend filter,
met nadruk op het bekendste risico — **relaties die verwijderde records tonen via
include/joins**. Alle top-level lijst- en zoek-queries bleken al correct te filteren;
de gaten zaten in geneste relaties, `_count`-aggregaties en enrichment-lookups.

### 2a. Gefixt (gedragsfixes, per stuk gereviewd)

Gesorteerd op risico. Elke fix is bevestigd als **échte omissie** (geen bewuste
"toon ook verwijderde"-plek) via review-subagents; bewijs = een zuster-relatie in
dezelfde query die al filterde, of een consument die geen verwijderde data verwacht.

| # | Bestand:regel | Model | Soort | Waarom een gat | Fix |
|---|---|---|---|---|---|
| 1 | `assets.service.ts` :187-188 | VisualInspection, MeasurementRecord | `include` (detail) | Asset-detail toonde álle uitvoerings-records incl. verwijderde; zuster `findings` filterde al `deletedAt:null` | `where:{deletedAt:null}` |
| 2 | `generation-context.service.ts` :52 | MeasurementSheetRecord | `include` (doc-generatie) | Gegenereerde documenten namen verwijderde meetstaten mee; zuster `contactPersons` filterde al | `where:{deletedAt:null}` |
| 3 | `assets.service.ts` :108-109 | VisualInspection, MeasurementRecord | `_count` | Telling in de asset-lijst telde verwijderde records mee (zuster `findings` telde al gefilterd) | filtered `_count` |
| 4 | `projects.service.ts` :36 | Request | `_count` | Project-telling telde verwijderde aanvragen mee | `requests:{where:{isDeleted:false}}` |
| 5 | `visual-inspections.service.ts` :62 | Finding | `_count` | `findings`-telling op de VI-lijst telde verwijderde constateringen mee | filtered `_count` |
| 6 | `documents.service.ts` (enrichWithEntityNames) | Contact, Request, Project, User, SupportTicket | batched `findMany` id→naam | Documentenlijst resolvede namen van verwijderde entiteiten | `isDeleted:false` |
| 7 | `tasks.service.ts` (enrichWithEntityNames) | Contact, Request, Project, User | batched `findMany` id→naam | Takenlijst resolvede namen van verwijderde entiteiten | `isDeleted:false` |
| 8 | `notes.service.ts` (enrichWithEntityNames) | Contact, Request, Project, User | batched `findMany` id→naam | Notitielijst resolvede namen van verwijderde entiteiten (identiek patroon als docs/tasks) | `isDeleted:false` |
| 9 | `search.service.ts` (resolveTask/DocumentEntityNames) | Contact, Request | batched `findMany` id→naam | Globale zoek-enrichment resolvede namen van verwijderde entiteiten | `isDeleted:false` |

Alle fixes zijn **klein** (alleen een `where`-toevoeging), degraderen netjes
(enrichment-miss → `entityName: null`) en zijn gedekt door `pnpm test` + `pnpm test:e2e`.

### 2b. Bewust NIET gewijzigd (gereviewd → intentioneel of uitgesteld)

| Plek | Reden om níet te fixen |
|---|---|
| `customer-groups.service.ts` :49 (`contacts` → `contact`) | Selecteert **expliciet** `isDeleted: true` op de member-contacten → bewuste "toon alles, client beslist"-keuze. Geen omissie. |
| To-one context-labels: `contacts.service.ts` :88/:113 (`customerGroup`), `requests.service.ts` findOne `contact`, `search.service.ts` `searchContactPersons`/`searchLocations` `contact`, `planning-public.controller.ts` `contact`/`location` | Prisma staat **geen** `where` toe op een to-**one** relatie in `select`/`include`. Dit zijn historische context-labels op een reeds geautoriseerd record; filteren vereist post-processing (gedragswijziging) → systemisch, hoort in Fase 2. |
| `contacts.service.ts` findOne :149, `requests.service.ts` findOne :165 | Weren verwijderde records al via `if (!x \|\| x.isDeleted) throw NotFound`. Gedrag is al correct; een `where`-filter is enkel defense-in-depth. |
| `users.service.ts` findOne :83 | `@Get(':id')` is **admin-only** (`@Roles(...ORG_ADMINS)`) en gebruikt `findUnique({where:{id}})`. Retourneert momenteel verwijderde users; of dat een admin-view-keuze is óf een gat is ambigu, en de fix vereist een `findFirst`-omschrijving (geen simpele filter). Beslissing hoort bij Fase 2 (met product-input). |

---

## 3. Tombstone-opruimjob (retentie)

`apps/api/src/modules/sync/tombstone-cleanup.service.ts` +
`tombstone-cleanup.service.spec.ts`.

- **Wat:** een `@Cron(EVERY_DAY_AT_3AM)`-scheduler (zelfde conventie als
  `quote-scheduler.service.ts`) die sync-tombstones met `deletedAt` ouder dan
  **90 dagen** hard verwijdert.
- **Idempotent:** `deleteMany({ where: { deletedAt: { lt: cutoff } } })` vindt bij
  een tweede run niets meer.
- **FK-veilige volgorde** (`TOMBSTONE_DELETE_ORDER`), afgeleid van de
  seed-opruimvolgorde in `prisma/seed.ts` — kind → ouder:
  `finding → visualInspection → measurementRecord → measurementSheetRecord →
  standaloneMeasurement → assetNode → inspectionPlan`.
  (`standaloneMeasurementValue` reist mee via `onDelete: Cascade`.)
- **Cascade-vrijwaring:** `assetNode` en `inspectionPlan` worden alléén verwijderd
  als er geen sync-kinderen meer aan hangen (`{ none: {} }`-guards). Zo kan een
  verlopen ouder nooit via `onDelete: Cascade` nog-**levende** kinderen meesleuren;
  de boom convergeert bottom-up over opeenvolgende runs. (Nodig omdat
  `inspection-plans.remove` alleen het plan tombstoned, niet de kinderen.)
- **Unit-test op de volgorde-logica:** bewijst dat `TOMBSTONE_DELETE_ORDER` exact de
  7 `SYNC_ENTITIES` dekt, geen duplicaten heeft en topologisch klopt t.o.v.
  `TOMBSTONE_FK_DEPENDENCIES` (elk kind vóór zijn ouder). Plus gedragstests op de
  90-dagen-cutoff, de aanroep-volgorde en de guards.

---

## 4. Migratievoorstel Fase 2 — `isDeleted → deletedAt` (NIET uitgevoerd)

**Doel:** één soft-delete-standaard: `deletedAt DateTime?`. Voordelen: audit-tijdstip
(wanneer verwijderd), uniforme retentie/opruiming, en één filter-idioom
(`deletedAt: null`) i.p.v. twee.

### 4.1 Scope
- **13 `isDeleted`-modellen** → migreren naar `deletedAt`.
- **3 "beide"-modellen** (User, Project, ProjectPhase) → `isDeleted` uitfaseren, alleen
  `deletedAt` behouden.
- Buiten scope: de 13 modellen die al `deletedAt` hebben.

### 4.2 Aanpak — expand/contract (per model, low-traffic eerst)

1. **Expand (schema):** voeg `deletedAt DateTime?` toe (bestaat al op de "beide"-modellen).
   Vervang `@@index([orgId, isDeleted])` door `@@index([orgId, deletedAt])`.
   *Geen partiële UNIQUE-indexen op `is_deleted` aanwezig — dat scheelt herwerk.*
2. **Backfill (migratie-SQL):**
   `UPDATE "x" SET "deleted_at" = COALESCE("deleted_at", "updated_at") WHERE "is_deleted" = true;`
   (`updatedAt` als best-effort tijdstip; `isDeleted` legde geen moment vast.)
3. **Dual-read (code):** pas per model de service-laag aan:
   - filters `isDeleted: false` → `deletedAt: null` (lijst, detail, `include`, `_count`, search-enrichment);
   - soft-delete-writes `isDeleted: true` → `deletedAt: new Date()`;
   - post-fetch checks `if (x.isDeleted)` → `if (x.deletedAt)`.
   Gebruik de tabel in §1 als checklist; grep-vangnet: `rg "isDeleted"` moet na
   afloop leeg zijn in de gemigreerde modules.
4. **Frontend/PWA:** portal en client-portal die `isDeleted` lezen/tonen
   (o.a. `customer-groups` selecteert `isDeleted: true`) omzetten naar `deletedAt`.
5. **Contract (drop):** ná uitrol een aparte migratie die de `is_deleted`-kolom dropt.

### 4.3 Aanbevolen volgorde (oplopend risico)
1. **Pilot, laag risico:** `DocumentTag`, `Note` (weinig relaties/consumers).
2. **CRM-kern:** `Contact`, `ContactPerson`, `Request` (veel filter-plekken; hoog risico op gemiste filters — leun op §1 + E2E).
3. **"Beide"-consolidatie:** `User`, `Project`, `ProjectPhase` (alleen `isDeleted` verwijderen; let op `users.service` `isActive`-koppeling).
4. **Rest:** `CustomerGroup`, `ProductGroup`, `Document`, `CustomFieldDefinition`, `SupportTicket`, `InspectorCertificate`, `MeasurementInstrument`, `Calibration`.

### 4.4 Risico's
- **Gemiste filter** → verwijderde records verschijnen weer. Mitigatie: inventaris §1
  als checklist, `rg "isDeleted"`-vangnet, en de E2E-suites hieronder.
- **Backfill-tijdstip** is benaderend (`updatedAt`); acceptabel voor retentie, niet
  voor juridische "verwijderd op"-claims.
- **Frontend-drift:** portal/PWA die `isDeleted` verwacht breekt als de kolom verdwijnt
  vóór de client-uitrol → houd expand/contract-volgorde aan.
- **`isActive` vs `deletedAt`** op User: niet samenvoegen — het zijn losse concepten.

### 4.5 Afdekkende E2E-tests (per gemigreerd model)
Bestaande suites die "verwijderd record niet zichtbaar" al borgen en per model
uitgebreid moeten worden met lijst/detail/search/`_count`-assertions:
`contacts.e2e-spec.ts`, `contact-persons` (via contacts), `documents.e2e-spec.ts`,
`document-tags.e2e-spec.ts`, `tasks.e2e-spec.ts`, `support-tickets.e2e-spec.ts`,
`custom-fields` (via `feature-entitlements`/contacts), `inspector-certificates.e2e-spec.ts`,
`measurement-instruments` (unit + e2e), `cross-tenant.e2e-spec.ts`,
`role-enforcement.e2e-spec.ts`. Voeg voor de CRM-kern expliciete regressietests toe:
"soft-deleted contact/request verschijnt niet in lijst, detail (404), globale search,
document/task-enrichment, noch in `_count`".
