# Plan — Unified Asset/Locatie-boom (MAIC-model)

> Status: **voorstel ter review (rev. 2)** · Opgesteld: juni 2026 · Scope: backend-schema, API, sync v2/PWA, portal, seed, tests
> Beslissingen (vastgelegd met Mathijs):
> 1. **Unified node-tabel** (MAIC-getrouw) — één recursieve tabel i.p.v. losse `Asset` + `InspectionLocation`.
> 2. **Boom-scope = per CRM-Locatie** (object/site) — elke CRM-locatie heeft één persistente boom, geworteld in die locatie.
> 3. **FK-koppeling met aparte velden** — de wortelnode verwijst 1:1 naar de CRM-`Location`; uitgebreide inspectiegegevens leven op de node.
> 4. **Alleen boom-herstructurering** — géén MAIC node-level permissies; bestaande RBAC/multi-tenancy/client-portal blijven leidend.
>
> Verfijningen na review (rev. 2):
> 5. **Inspectie ≠ één locatie.** Een inspectie hoort bij één **hoofdlocatie** (CRM-Locatie, = boom-wortel) maar wordt uitgevoerd op **één of meer deellocaties** dieper in de boom. Scope = een set LOCATION-nodes via een join-tabel `InspectionPlanLocation`, niet één `locationId`.
> 6. **Materialised path = PostgreSQL `ltree`** vanaf de start (niet string-path), inclusief extensie, trigger-onderhoud en GiST-index. Zie §3.1 en §7.2 voor de Prisma-implicaties.
> 7. **Compat-wrappers + PWA-cutoverdoc.** De oude `assets`/`inspection-locations` endpoints blijven tijdelijk als wrappers staan; Fase 3 levert een expliciete cutover-handleiding voor de PWA op (`docs/fase3/PWA-CUTOVER-ASSET-NODE.md`).

---

## 1. Probleem in één alinea

Vandaag hangen zowel `Asset` als `InspectionLocation` **verplicht onder één `InspectionPlan`** (`inspection_plan_id` is `NOT NULL`, `onDelete: Cascade`). Een asset is dus geen zelfstandig, herbruikbaar object maar een wegwerp-record van één inspectie: verwijder je de inspectie, dan verdwijnen de assets. Dat botst met de eis dat assets een **persistente boom** vormen (zoals MAIC), niet onder een inspectie *hangen* maar er wél *tijdens* een inspectie bij gemaakt kunnen worden, en dat de boom hoort bij de **CRM-locatie** waar de inspectie betrekking op heeft. Ook ontbreekt elke koppeling tussen de CRM-`Location` (relatie-adres, met BAG/PDOK-data) en de inspectie-locatieboom.

De kern van de oplossing is een conceptuele splitsing die nu ontbreekt:

| Laag | Wat | Levensduur | Eigenaar |
|---|---|---|---|
| **Structuur** | De boom van Locaties + Assets (identiteit, metadata, hiërarchie) | Persistent | Organisatie + CRM-Locatie |
| **Uitvoering** | Findings, metingen, meetstaten, handtekeningen, rapporten | Per inspectie | InspectionPlan |

Nu zit alles aan de uitvoeringskant vastgeklonken; de structuur moet eruit gelicht worden naar een eigen, blijvende laag.

---

## 2. Huidige opzet (zoals aangetroffen in de codebase)

### 2.1 Twee parallelle, plan-gescopete bomen

```
InspectionPlan (1) ──< Asset            (asset_id-boom via parentAssetId, inspection_plan_id NOT NULL, CASCADE)
InspectionPlan (1) ──< InspectionLocation (parent_location_id-boom,      inspection_plan_id NOT NULL, CASCADE)
Asset.location_id ──> InspectionLocation (optioneel; koppelt asset aan een inspectie-locatie)
```

- `Asset` (`imp_assets`): `inspectionPlanId` **required** + `onDelete: Cascade`; `parentAssetId` (self-hiërarchie), `locationId?` → `InspectionLocation`, ongebruikt `treePath`, `assetType` als **code-string** → `AssetTypeDefinition.code`.
- `InspectionLocation` (`imp_inspection_locations`): `inspectionPlanId` **required** + `onDelete: Cascade`; `parentLocationId` (self-hiërarchie), ongebruikt `treePath`, `locationType` als **code-string** → `LocationTypeDefinition.code`.
- Geen materialised path-onderhoud in de service; `treePath` bestaat maar wordt nergens gevuld.

### 2.2 CRM-Locatie staat los

`Location` (`imp_locations`) hangt onder `Contact`, met `street/houseNumber/postalCode/city`, PDOK/BAG-verrijking (`gebruiksfunctie`, `bouwjaar`, `oppervlakte`, `bagId`), `customFields`, en `locationTypeId` → `LocationTypeDefinition`. Er is **geen** relatie naar `InspectionLocation`. `InspectionPlan` verwijst naar `Contact` (+ losse adresvelden), **niet** naar een CRM-`Location`.

### 2.3 Configuratielaag bestaat al (goed nieuws)

`AssetTypeDefinition` / `LocationTypeDefinition` zijn al MAIC-achtige "level types": `code`, `name`, `icon`, `color`, velden (`*TypeField`), en parent-constraints (`*TypeConstraint`). `LocationTypeDefinition.scope` (`INSPECTION | CRM`) scheidt nu al inspectie-boomtypes van CRM-objecttypes. Deze laag kunnen we hergebruiken — geen herbouw nodig.

### 2.4 Alles wat naar `Asset`/`InspectionLocation` wijst (de FK-blast-radius)

Verwijzingen naar **`Asset`** (worden `assetNodeId` → `AssetNode` met `nodeType = ASSET`):

| Model | Veld | Gedrag |
|---|---|---|
| `VisualInspection` | `assetId` | Cascade |
| `MeasurementRecord` | `assetId` | Cascade |
| `Finding` | `assetId` | Cascade |
| `MeasurementSheetRecord` | `assetId` | Cascade |
| `LocationImageMarker` | `assetId?` | SetNull |
| `StandaloneMeasurement` | `linkedAssetId?` | (link) |
| `Asset` | `parentAssetId?` | self → wordt `parentId` |

Verwijzingen naar **`InspectionLocation`** (worden node-refs → `AssetNode` met `nodeType = LOCATION`):

| Model | Veld | Gedrag |
|---|---|---|
| `Asset` | `locationId?` | → opgaat in `parentId` (asset onder locatie-node) |
| `LocationImage` | `locationId` (unique) | Cascade → wordt `nodeId` |
| `StandaloneMeasurement` | `locationId` | → locatie-node |
| `InspectionLocation` | `parentLocationId?` | self → wordt `parentId` |

Verwijzingen naar **`InspectionPlan`** die van betekenis veranderen:

| Model | Nu | Straks |
|---|---|---|
| `Asset.inspectionPlanId` | required, cascade | **verwijderd** (asset wordt persistent) |
| `InspectionLocation.inspectionPlanId` | required, cascade | **verwijderd** (locatie wordt persistent) |
| `VisualInspection` | geen plan-FK (via asset) | **`inspectionPlanId` toevoegen** |
| `MeasurementRecord` | geen plan-FK (via asset) | **`inspectionPlanId` toevoegen** |
| `Finding` | geen plan-FK (via asset) | **`inspectionPlanId` toevoegen** |
| `MeasurementSheetRecord.inspectionPlanId` | optioneel | behouden, **verplicht maken** |
| `StandaloneMeasurement.inspectionPlanId` | required | behouden |

### 2.5 Sync v2 (PWA-afhankelijkheid — let op)

`apps/api/src/modules/sync/sync-mapper.ts` heeft een `assets`-entiteit met `org: { from: 'parent', fkField: 'inspectionPlanId', parentModel: 'inspectionPlan' }` en een `allowed`-lijst inclusief `inspectionPlanId`, `parentAssetId`, `locationId`. De PWA (aparte repo `../Inspexi-App`, Dexie v9, branch `feat/pwa-v2-sync-contract`) stuurt assets/locaties mét `inspectionPlanId`. **Het ontkoppelen van assets van het plan is per definitie een breaking change op het sync-contract** en vereist een gecoördineerde wijziging aan PWA-kant. Dit is het grootste risico van dit plan (zie §7).

---

## 3. Doelmodel

### 3.1 Eén unified `AssetNode` (vervangt `Asset` + `InspectionLocation`)

```prisma
enum AssetNodeType {
  LOCATION
  ASSET
}

model AssetNode {
  id    String @id @default(uuid()) @db.Uuid
  orgId String @map("org_id") @db.Uuid            // gedenormaliseerd voor tenant-scope + sync-org

  nodeType AssetNodeType @map("node_type")

  // Boomstructuur
  parentId       String? @map("parent_id") @db.Uuid          // NULL = wortel (altijd een LOCATION)
  rootLocationId String? @unique @map("root_location_id") @db.Uuid // alleen op de wortel: 1:1 FK → CRM-Location; NULL op niet-root

  // Identiteit & type (code-string, net als nu)
  typeCode   String  @map("type_code")   // → AssetTypeDefinition.code (ASSET) of LocationTypeDefinition.code (LOCATION)
  name       String
  identifier String?

  // Inhoud
  description   String?                                  // locatie-omschrijving / asset-locationDescription
  technicalData Json    @default("{}") @map("technical_data") // custom velden per type-definitie
  statusCode    String  @default("new") @map("status")   // → imp_asset_status_types.code (vnl. voor ASSET)
  notes         String?

  // Materialised path (PostgreSQL ltree)
  sortOrder Int                    @default(0) @map("sort_order")
  path      Unsupported("ltree")?                                  // labels = hyphen-stripped UUIDs; gevuld via DB-trigger
  depth     Int                    @default(0)

  // Audit/sync
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  syncedAt  DateTime? @map("synced_at")
  createdBy String?   @map("created_by") @db.Uuid
  deviceId  String?   @map("device_id")
  deletedAt DateTime? @map("deleted_at")

  organization Organization @relation(fields: [orgId], references: [id])
  rootLocation Location?    @relation("AssetNodeRoot", fields: [rootLocationId], references: [id]) // alleen op de wortel
  parent       AssetNode?   @relation("AssetNodeHierarchy", fields: [parentId], references: [id])
  children     AssetNode[]  @relation("AssetNodeHierarchy")
  createdByUser User?       @relation("AssetNodeCreatedBy", fields: [createdBy], references: [id])

  // Uitvoerings-back-relations (alleen relevant voor ASSET-nodes, m.u.v. image op LOCATION-nodes)
  visualInspections       VisualInspection[]
  measurementRecords      MeasurementRecord[]
  findings                Finding[]
  measurementSheetRecords MeasurementSheetRecord[]
  markers                 LocationImageMarker[]
  linkedMeasurements      StandaloneMeasurement[] @relation("LinkedAsset")
  image                   LocationImage?                          // floor-plan op een LOCATION-node
  standaloneMeasurements  StandaloneMeasurement[] @relation("NodeStandalone")
  planScopes              InspectionPlanLocation[]                // inspecties waarvoor deze LOCATION-node in scope is

  @@index([orgId])
  @@index([parentId])
  @@index([orgId, updatedAt])
  // rootLocationId is al geïndexeerd via @unique
  // GiST-index op `path` kan Prisma niet uitdrukken voor een Unsupported-veld → handmatig in de migratie:
  //   CREATE INDEX imp_asset_nodes_path_gist ON imp_asset_nodes USING GIST (path);
  @@map("imp_asset_nodes")
}
```

**ltree-implementatie** (rev. 2 — vervangt de eerdere string-path):

- Extensie aanzetten in de migratie: `CREATE EXTENSION IF NOT EXISTS ltree;`
- `path` is `Unsupported("ltree")?` zodat Prisma de juiste kolomtype migreert; Prisma Client kan dit veld niet selecteren/filteren → boom-queries gaan via `$queryRaw` met ltree-operatoren (`<@` descendant, `@>` ancestor, `nlevel`, `subpath`).
- **UUID-gotcha:** ltree-labels mogen alleen `[A-Za-z0-9_]` bevatten; UUID's bevatten `-`. Labels = **hyphen-stripped UUID** (`replace(id::text,'-','')`, 32 hex-tekens — geldig label).
- Path + depth worden gevuld door een `BEFORE INSERT/UPDATE`-trigger (parentpath `||` eigen label). Een `move` herschrijft de subtree-paths **én depth** met `UPDATE ... SET path = :newbase || subpath(path, nlevel(:oldbase) - 1), depth = nlevel(<dat pad>) WHERE path <@ :oldbase` (de trigger fixt alleen de verplaatste node, niet z'n descendants → depth zou anders stale worden).
- GiST-index op `path` voor snelle subtree-/ancestor-queries (handmatig in de migratie, zie boven).

**Boom-invarianten** (afgedwongen in de service-laag; DB kan conditionele constraints niet mooi uitdrukken):

1. De **wortel** heeft `parentId = NULL`, `nodeType = LOCATION`, en `rootLocationId` gezet (uniek, 1:1 FK → CRM-Locatie). Een node is wortel ⇔ `parentId IS NULL` ⇔ `rootLocationId IS NOT NULL`. De eerste node in een boom is dus altijd een Locatie die 1:1 aan een CRM-Locatie hangt.
2. Niet-root-nodes hebben `rootLocationId = NULL` en bereiken hun CRM-locatie door naar de wortel te klimmen. "Geef de hele boom voor locatie X": wortel opzoeken via de unique FK → `WHERE path <@ wortel.path` (beide geïndexeerd).
3. Een `LOCATION`-node mag alleen een `LOCATION`-node als parent hebben.
4. Een `ASSET`-node mag een `LOCATION`-node óf een `ASSET`-node als parent hebben.
5. **Type-constraints**: bestaande `AssetTypeConstraint` (asset→asset) en `LocationTypeConstraint` (locatie→locatie) blijven gelden binnen hun eigen niveau. De overgang locatie→asset (eerste asset onder een locatie) kent géén constraint en is altijd toegestaan.

### 3.2 CRM-Location ↔ wortelnode

```prisma
// in model Location (imp_locations):
  assetNodeRoot AssetNode? @relation("AssetNodeRoot")  // 1:1; de wortel van de inspectie-boom voor deze locatie
```

De CRM-`Location` blijft schoon (adres, BAG/PDOK). De "uitgebreidere inspectiegegevens" leven op de wortel-`AssetNode` (`technicalData` volgens een `LocationTypeDefinition` met `scope = INSPECTION`) en op de sub-locatie-nodes. De wortelnode wordt **lazily** aangemaakt zodra een locatie voor het eerst in een inspectie wordt gebruikt (create-on-first-use), zodat bestaande CRM-locaties niet allemaal meteen een boom hoeven te hebben.

### 3.3 InspectionPlan wordt "uitvoering tegen een locatie-boom"

Een inspectie hoort bij één **hoofdlocatie** (CRM-Locatie, = boom-wortel) maar wordt uitgevoerd op **één of meer deellocaties** dieper in de boom. Daarom: een `locationId` (hoofdlocatie, voor ensure-root-node en boomweergave) **plus** een join-tabel voor de feitelijke scope-deellocaties.

```prisma
// in model InspectionPlan:
  locationId String?   @map("location_id") @db.Uuid   // CRM-Location = hoofdlocatie / boom-wortel
  location   Location? @relation(fields: [locationId], references: [id])
  scopeLocations InspectionPlanLocation[]             // deellocaties (LOCATION-nodes) in scope
  // 'assets' en 'locations' relaties VERVALLEN

// nieuw join-model:
model InspectionPlanLocation {
  id               String  @id @default(uuid()) @db.Uuid
  orgId            String  @map("org_id") @db.Uuid
  inspectionPlanId String  @map("inspection_plan_id") @db.Uuid
  assetNodeId      String  @map("asset_node_id") @db.Uuid   // moet nodeType = LOCATION zijn
  isPrimary        Boolean @default(false) @map("is_primary")

  organization   Organization   @relation(fields: [orgId], references: [id])
  inspectionPlan InspectionPlan @relation(fields: [inspectionPlanId], references: [id], onDelete: Cascade)
  assetNode      AssetNode      @relation(fields: [assetNodeId], references: [id])

  @@unique([inspectionPlanId, assetNodeId])
  @@index([assetNodeId])
  @@map("imp_inspection_plan_locations")
}
```

- `InspectionPlan.locationId` (CRM-hoofdlocatie) bepaalt de **boom** waarin gewerkt wordt (`rootLocationId = plan.locationId`); `scopeLocations` bepalen **welke deellocaties** binnen die boom in scope zijn. Leeg = de hele boom (wortel) in scope.
- **Invariant:** elke `scopeLocation.assetNode` is `nodeType = LOCATION` en zit in de boom waarvan de wortel `rootLocationId = plan.locationId` heeft (alle deellocaties horen bij dezelfde hoofdlocatie-boom; afleiden via de boom-wortel, niet via een veld op de deellocatie-node zelf).
- **Default-parent** bij een asset **vanuit een inspectie**: precies één scope-deellocatie → die node; meerdere → de gebruiker kiest; geen scope → de wortel-LOCATION-node. De UI toont de parent-selector altijd voorgevuld en wijzigbaar.
- Uitvoeringsrecords krijgen een directe `inspectionPlanId` (zie 3.4), zodat "wat is er tijdens inspectie X vastgelegd" niet meer via de asset hoeft te lopen.

### 3.4 Uitvoeringsrecords krijgen plan-context + node-ref

| Model | Wijziging |
|---|---|
| `VisualInspection` | `assetId → assetNodeId`; **`inspectionPlanId` (required)** toevoegen |
| `MeasurementRecord` | `assetId → assetNodeId`; **`inspectionPlanId` (required)** toevoegen |
| `Finding` | `assetId → assetNodeId`; **`inspectionPlanId` (required)** toevoegen |
| `MeasurementSheetRecord` | `assetId → assetNodeId`; `inspectionPlanId` van optioneel → **required** |
| `StandaloneMeasurement` | `locationId → locationNodeId` (LOCATION-node); `linkedAssetId → linkedAssetNodeId`; `inspectionPlanId` blijft |
| `LocationImage` | `locationId → nodeId` (LOCATION-node, 1:1) — **persistent** op de node, herbruikbaar over inspecties |
| `LocationImageMarker` | `assetId → assetNodeId` |

> **Ontwerpnotitie floor-plan/markers:** de plattegrond (`LocationImage`) hoort bij een LOCATION-node en is persistent. Markers die naar een **asset** wijzen zijn positionering (persistent); markers die naar een **finding/standalone-meting** wijzen zijn uitvoering (per inspectie). Voor v1 houden we markers op de node-plattegrond en filteren we finding-markers in de UI op de actieve inspectie. Dit is een bewuste vereenvoudiging — als floor-plans per inspectie moeten verschillen, is een aparte `inspectionPlanId` op `LocationImage` later een kleine toevoeging.

### 3.5 Voorbeeld-boom (zoals MAIC, maar per CRM-locatie geworteld)

```
Diepte  Node                         nodeType   typeCode
0       Hoofdkantoor (CRM-Locatie)   LOCATION   gebouw        ← rootLocationId gezet (1:1 FK → CRM-Locatie)
1       └─ Verdieping 3              LOCATION   verdieping
2          └─ Serverruimte 3A        LOCATION   ruimte
3             └─ Hoofdverdeler HVK   ASSET      verdeler
4                └─ Groep 12         ASSET      groep
2          └─ Kantoor 302           LOCATION   ruimte
3             └─ Wandcontactdoos     ASSET      wcd
```

Inspectie "EBI 2026" heeft `locationId = Hoofdkantoor` (hoofdlocatie) en bijvoorbeeld `scopeLocations = [Serverruimte 3A]` (deellocatie, dieper in de boom). Werkt op de boom van Hoofdkantoor, met scope op de subtree van Serverruimte 3A; nieuwe assets defaulten dan onder `Serverruimte 3A` (wijzigbaar); findings/metingen verwijzen naar asset-nodes én dragen `inspectionPlanId = EBI 2026`. Een tweede inspectie kan later op `Kantoor 302` dezelfde boom hergebruiken.

---

## 4. Impact per laag (overzicht)

| Laag | Wijziging | Omvang |
|---|---|---|
| **Prisma-schema** | Nieuwe `AssetNode` + `AssetNodeType` (ltree `path`); join `InspectionPlanLocation`; FK-renames (§2.4); `InspectionPlan.locationId`; `Location.assetNodeRoot`; verwijderen `Asset`/`InspectionLocation` | Groot |
| **Migratie** | Eén `migrate dev`-migratie (dev/seed → big-bang); migratie-SQL handmatig aanvullen met `CREATE EXTENSION ltree`, path-trigger en GiST-index | Middel |
| **API — nieuw `asset-nodes`-module** | Tree-CRUD: tree-per-locatie (raw ltree-query), node detail, create (parent + type-constraint), move (subtree-path via raw SQL), soft-delete-subtree | Groot |
| **API — bestaande modules** | `assets` + `inspection-locations` → herschrijven als thin wrappers of opheffen; `findings`/`visual-inspections`/`measurements`/`measurement-sheets` services zetten `inspectionPlanId` + `assetNodeId`; `inspection-plans` create zet `locationId` + ensure-root-node | Groot |
| **Sync v2 → v2.1/v3** | `sync-mapper`: één `assetNodes`-entiteit, org uit `node.orgId`; contract-doc; **PWA companion** (Dexie-bump, store-merge) | Groot (cross-repo) |
| **Portal** | Tree-component (Locatie+Asset gecombineerd); inspectie-Assets-tab → boom; floor-plan-selector uit boom; CRM-Locatie-detail krijgt boom + inspectievelden | Groot |
| **Seed** | Echte boom bouwen: wortel-node ↔ CRM-Location, sub-locaties, assets, findings/metingen met `inspectionPlanId` | Middel |
| **Tests** | E2E `assets`/`inspection-locations`/`cross-tenant` herschrijven; unit-tests path/move/constraints | Middel |
| **Docs** | `CLAUDE.md` (modellenaantal, modules, gotchas) + ADR + PWA-cutoverdoc | Klein |

---

## 5. Gefaseerd implementatieplan

Elke fase = één of enkele commits, los testbaar. Volgorde respecteert afhankelijkheden (schema → API → sync → portal → seed/tests). De prompts hieronder zijn bedoeld om in Claude Code te plakken; ze zijn in het **Engels** conform de repo-conventie (code/commits/technische docs Engels).

### Fase 0 — ADR & contract-bevriezing (geen code)
**Doel:** beslissingen vastleggen vóór code, zodat PWA-team en backend dezelfde contractversie bouwen.

- Leg het doelmodel (§3) vast als ADR in `docs/adr/`.
- Materialised path = **PostgreSQL `ltree`** (besloten): documenteer de extensie, de path-trigger, de hyphen-stripped-UUID-labels, de GiST-index en de raw-SQL boom-/move-queries (§3.1, §7.2).
- Bevries de nieuwe sync-contractversie (entiteitnaam `assetNodes`, veldenlijst, org-afleiding) en deel met PWA-team.

> **Prompt 0 (ADR):**
> ```
> Read docs/INTEGRATIE-INSPEXI-APP.md and apps/api/prisma/schema.prisma (models Asset,
> InspectionLocation, InspectionPlan, Location, VisualInspection, MeasurementRecord, Finding,
> MeasurementSheetRecord, LocationImage, LocationImageMarker, StandaloneMeasurement, and the
> AssetTypeDefinition/LocationTypeDefinition config models).
>
> Write an ADR at docs/adr/0001-unified-asset-node-tree.md that records this decision: replace the
> two plan-scoped tables (Asset, InspectionLocation) with a single persistent recursive table
> AssetNode (nodeType LOCATION|ASSET), scoped per CRM Location (root node has a 1:1 FK to imp_locations),
> decoupled from InspectionPlan. Execution records (VisualInspection, MeasurementRecord, Finding,
> MeasurementSheetRecord) gain a direct inspectionPlanId. An inspection belongs to one CRM "hoofdlocatie"
> (InspectionPlan.locationId) and targets one-or-more sub-locations via a join table InspectionPlanLocation.
> Document the tree invariants, the structure-vs-execution split, and the materialised-path implementation
> using PostgreSQL ltree: the ltree extension, a BEFORE INSERT/UPDATE trigger that fills path/depth, labels
> as hyphen-stripped UUIDs (ltree labels disallow '-'), a GiST index on path, raw-SQL subtree/ancestor
> queries (<@, @>, nlevel, subpath), and the move operation rewriting descendant paths. Do NOT change any
> code yet.
> ```

### Fase 1 — Schema & migratie
**Doel:** `AssetNode` bestaat, alle FK's wijzen er correct heen, oude tabellen weg, één nette migratie.

- `AssetNodeType` enum + `AssetNode`-model (§3.1, ltree `path`) + join `InspectionPlanLocation` (§3.3) toevoegen.
- `InspectionPlan.locationId` (+ relatie) + `scopeLocations`, `Location.assetNodeRoot`-back-relatie toevoegen.
- Alle FK-renames uit §2.4 / §3.4 doorvoeren; `Asset` en `InspectionLocation` verwijderen.
- `inspectionPlanId` toevoegen aan `VisualInspection`/`MeasurementRecord`/`Finding` (required) en op `MeasurementSheetRecord` required maken.
- Migratie draaien vanuit `apps/api/` met `npx prisma migrate dev --name unified-asset-node-tree` (**nooit** `db push`), daarna de **gegenereerde migratie-SQL handmatig aanvullen** met `CREATE EXTENSION IF NOT EXISTS ltree;`, de path/depth-trigger en de GiST-index, en de migratie opnieuw toepassen.
- `apps/portal/src/types/index.ts` + `apps/api`-types bijwerken (AssetNode-interface, AssetNodeType).

> **Prompt 1 (schema):**
> ```
> In apps/api/prisma/schema.prisma, implement the unified AssetNode model exactly as specified in
> docs/PLAN-ASSET-NODE-TREE.md §3 (model AssetNode with `path Unsupported("ltree")?` and a root-only
> `rootLocationId String? @unique` FK to Location, enum AssetNodeType, table imp_asset_nodes) and the
> join model InspectionPlanLocation (§3.3, imp_inspection_plan_locations).
> Then:
> - Remove models Asset and InspectionLocation.
> - Repoint every FK that referenced Asset to AssetNode (rename to assetNodeId): VisualInspection,
>   MeasurementRecord, Finding, MeasurementSheetRecord, LocationImageMarker (assetId->assetNodeId),
>   StandaloneMeasurement (linkedAssetId->linkedAssetNodeId).
> - Repoint every FK that referenced InspectionLocation to AssetNode (a LOCATION node): LocationImage
>   (locationId->nodeId, keep @unique), StandaloneMeasurement (locationId->locationNodeId).
> - Add inspectionPlanId (required) to VisualInspection, MeasurementRecord, Finding; make
>   MeasurementSheetRecord.inspectionPlanId required.
> - Add InspectionPlan.locationId (nullable FK -> Location) + the relation + scopeLocations
>   (InspectionPlanLocation[]); remove the assets[] and locations[] relations from InspectionPlan. Add
>   Location.assetNodeRoot back-relation.
> Keep all @@map table names and naming conventions consistent with the rest of the schema. Do not run
> the migration yet — first show me the full schema diff for the affected models.
> ```
>
> **Prompt 1b (migratie + ltree + types):**
> ```
> From apps/api/, run: npx prisma migrate dev --name unified-asset-node-tree (NEVER prisma db push).
> Before applying, edit the generated migration SQL to also:
>   - CREATE EXTENSION IF NOT EXISTS ltree;
>   - create a plpgsql trigger function on imp_asset_nodes (BEFORE INSERT OR UPDATE OF parent_id) that sets
>     NEW.path = (parent.path || replace(NEW.id::text,'-','')) and NEW.depth = nlevel(parent.path), or a
>     single root label + depth 0 when parent_id IS NULL;
>   - an AFTER UPDATE OF parent_id trigger (or service-side raw UPDATE) that rewrites descendant paths:
>     UPDATE imp_asset_nodes SET path = NEW.path || subpath(path, nlevel(OLD.path)) WHERE path <@ OLD.path;
>   - CREATE INDEX imp_asset_nodes_path_gist ON imp_asset_nodes USING GIST (path);
> Re-apply and fix any migration errors. Then update apps/portal/src/types/index.ts: add AssetNodeType
> and AssetNode interfaces, remove the standalone Asset/InspectionLocation interfaces, and update every type
> that referenced assetId/locationId on execution records to assetNodeId/nodeId. Run `npx turbo run build`
> from the root and fix all TypeScript errors.
> ```

### Fase 2 — API: `asset-nodes`-module + aanpassen uitvoeringsmodules
**Doel:** persistente tree-CRUD + uitvoeringsrecords dragen plan-context; assets aanmaken vanuit een inspectie defaulten naar de plan-locatie.

- Nieuwe module `apps/api/src/modules/asset-nodes/` met:
  - `GET /locations/:locationId/tree` — hele boom voor een CRM-locatie (ensure-root-node on first call; subtree via raw ltree-query `WHERE path <@ :rootPath`).
  - `GET /asset-nodes/:id`, `POST /asset-nodes` (parent + nodeType + typeCode + constraint-validatie; path/depth via trigger), `PATCH /asset-nodes/:id`, `POST /asset-nodes/:id/move` (subtree-paths herschrijven via raw SQL), `DELETE /asset-nodes/:id` (soft-delete subtree via `path <@`).
  - `GET /inspection-plans/:planId/tree` — boom van `plan.locationId` met de `scopeLocations` gemarkeerd.
- Constraint-helpers (parent-type-validatie, locatie→asset altijd toegestaan, invarianten uit §3.1); path/depth komen uit de DB-trigger, niet uit de service.
- `inspection-plans` create/update: `locationId` (hoofdlocatie) accepteren, valideren same-org, **ensure-root-node** aanmaken als die nog niet bestaat; `scopeLocations` (deellocatie-nodes) accepteren en valideren dat elke node `nodeType = LOCATION` en `rootLocationId = plan.locationId` heeft.
- `findings`/`visual-inspections`/`measurements`/`measurement-sheets` services: zet `inspectionPlanId` + `assetNodeId`; valideer dat de asset-node `rootLocationId = plan.locationId` heeft.
- `assets`-module en `inspection-locations`-module: endpoints behouden als thin compat-wrappers die naar `asset-nodes` mappen (verwijderen ná de PWA-cutover — zie Fase 3).
- Cross-tenant: `assertSameOrg`/`assertAllSameOrg` op `parentId`, `rootLocationId`, `assetNodeId`, `locationId`, `scopeLocations[].assetNodeId`.

> **Prompt 2a (asset-nodes module):**
> ```
> Create a new NestJS module apps/api/src/modules/asset-nodes/ following the conventions in CLAUDE.md
> (controller delegates to service, @Roles, @ApiTags, paginate/orgScope/assertFound helpers from @/common,
> @Controller('asset-nodes') without the api/v1 prefix). Endpoints:
>   GET  /locations/:locationId/tree           -> full AssetNode tree for a CRM Location (call ensureRootNode first)
>   GET  /inspection-plans/:planId/tree        -> tree for plan.locationId, with scopeLocations flagged
>   GET  /asset-nodes/:id
>   POST /asset-nodes                          -> { parentId?, nodeType, typeCode, name, identifier?, description?, technicalData?, notes?, rootLocationId? (only when creating a root) }
>   PATCH /asset-nodes/:id
>   POST /asset-nodes/:id/move                 -> { newParentId, sortOrder? }  (rewrite ltree path/depth for the whole subtree)
>   DELETE /asset-nodes/:id                    -> soft-delete subtree (set deletedAt on node + descendants via path <@)
> Path and depth are maintained by the DB trigger (do NOT compute them in the service). Read subtrees with
> $queryRaw using ltree operators (WHERE path <@ :rootPath ORDER BY path); implement move as a raw UPDATE
> rewriting descendant paths (path = :newBase || subpath(path, nlevel(:oldBase))). Implement a TreeService
> helper that enforces the invariants from docs/PLAN-ASSET-NODE-TREE.md §3.1 (root is a LOCATION with
> rootLocationId set + parentId null; LOCATION parent must be LOCATION; ASSET parent may be LOCATION or ASSET;
> a node's site is found by climbing to its root (the ancestor with parent_id IS NULL), whose
> rootLocationId is the CRM Location) and validates type constraints via the existing AssetTypesService /
> LocationTypesService (asset->asset and location->location constraints; location->asset is always allowed).
> Add ensureRootNode(locationId, user) that creates the root LOCATION node with rootLocationId = that CRM
> Location if missing (guard the race with the rootLocationId @unique constraint). Write unit tests
> (.spec.ts) for move (subtree path + depth rewrite), invariants, and constraint validation. Use
> assertSameOrg for parentId/rootLocationId.
> ```
>
> **Prompt 2b (plan + scope + execution wiring):**
> ```
> Update apps/api/src/modules/inspection-plans: accept locationId (CRM hoofdlocatie) on create/update,
> validate same-org, and call AssetNodesService.ensureRootNode(locationId, user) so the plan's working tree
> exists. Add management of scopeLocations (InspectionPlanLocation join rows, each with orgId + isPrimary):
> accept an array of LOCATION assetNodeIds, validate each is nodeType=LOCATION, same-org, and that its tree
> root's rootLocationId === plan.locationId, and expose endpoints to add/remove scope locations. Then update
> the findings, visual-inspections, measurement-records and measurement-sheet services so that creating any
> execution record sets inspectionPlanId AND assetNodeId, and validates that the asset node's tree root
> (the ancestor with parent_id IS NULL) has rootLocationId === plan.locationId.
> When an asset node is created "from an inspection" (POST /inspection-plans/:planId/asset-nodes or a
> from-plan flag), default parentId to: the single scope location if there is exactly one, else the plan's
> root LOCATION node — and always allow the caller to override it. Update all affected .spec.ts and e2e suites.
> ```

### Fase 3 — Sync-contract + PWA-coördinatie (breaking, cross-repo)
**Doel:** sync werkt op persistente nodes; PWA en backend op dezelfde contractversie.

- `sync-mapper.ts`: vervang `assets`/`inspectionLocations` door één `assetNodes`-entiteit; `org: { from: 'self' }` (node heeft eigen `orgId`); `allowed`-lijst = node-velden (`parentId`, `rootLocationId` (alleen op roots), `nodeType`, `typeCode`, `name`, `identifier`, `description`, `technicalData`, `statusCode`, `notes`, `sortOrder`, `createdBy`, `deviceId`). `path`/`depth` zitten **niet** in de allowed-lijst (trigger-onderhouden). Voeg `inspectionPlanId` toe aan de sync-allowed van findings/visual-inspections/measurements.
- Versiebump van het sync-contract (bv. `v2.1`) met een korte migratienotitie; backend accepteert tijdelijk beide of weigert oude clients met duidelijke foutcode.
- **Verplichte deliverable: PWA-cutoverhandleiding** `docs/fase3/PWA-CUTOVER-ASSET-NODE.md` — beschrijft het nieuwe contract (entiteit `assetNodes`, org-from-self, ltree-path-veld dat de PWA als string ontvangt), de Dexie-migratie (v9 → v10: `assets` + `locations` stores samenvoegen tot `assetNodes`), offline-aanmaken van assets zónder plan-koppeling (met `rootLocationId`/`parentId`), en de stap-voor-stap cutovervolgorde + rollback.
- **Companion-taak in `../Inspexi-App`** (aparte repo, branch `feat/pwa-v2-sync-contract`): de cutover zelf uitvoeren volgens die handleiding.

> **Prompt 3 (backend sync):**
> ```
> Update apps/api/src/modules/sync/sync-mapper.ts: remove the assets and inspectionLocations sync
> entities and add a single assetNodes entity for model assetNode with org derivation { from: 'self' }
> (the node has its own orgId) and an allowed list of: parentId, rootLocationId (only set on root nodes),
> nodeType, typeCode, name, identifier, description, technicalData, statusCode, notes, sortOrder, createdBy,
> deviceId. Do NOT include path/depth (trigger-maintained).
> Add inspectionPlanId to the allowed lists of findings, visual-inspections and measurement-records sync
> entities. Bump the sync contract version. Update sync e2e tests. Then WRITE the cutover guide at
> docs/fase3/PWA-CUTOVER-ASSET-NODE.md covering: the new contract (assetNodes entity, org-from-self, the
> ltree path delivered to the PWA as a plain string), the Dexie v9->v10 migration (merge the assets +
> locations stores into a single assetNodes store), offline asset creation without a plan link (using
> rootLocationId/parentId), and a step-by-step cutover order with rollback. Do NOT touch the ../Inspexi-App
> repo — the cutover guide is the hand-off for that repo.
> ```

### Fase 4 — Portal (staf-backoffice)
**Doel:** één boom-UI voor Locatie+Asset, herbruikt op CRM-Locatie-detail én in de inspectie.

- Tree-component `components/asset-tree/` (expand/collapse, breadcrumb, node-iconen op `typeCode`, create/move/delete, parent-selector). Data via `GET /locations/:id/tree` of `/inspection-plans/:planId/tree`.
- Inspectie-detail "Assets"-tab → boomweergave van de werk-boom (met scope-deellocaties gemarkeerd); "Asset toevoegen" opent modal met parent-selector **voorgevuld** op de scope-deellocatie (bij precies één) of de hoofdlocatie-wortel, altijd wijzigbaar.
- "Plattegrond"-tab: locatie-selector uit de boom (LOCATION-nodes).
- CRM-Locatie-detailpagina: nieuwe sectie met de inspectie-boom + uitgebreide inspectievelden (technicalData op de wortelnode, gestuurd door `LocationTypeDefinition` met `scope = INSPECTION`).
- Hooks `pages/.../hooks/use-asset-nodes.ts` (tree-query, create/move/delete-mutaties) — géén handmatige `apiClient.get` in `useEffect`, conform CLAUDE.md.

> **Prompt 4 (portal tree UI):**
> ```
> In apps/portal, build a reusable asset-tree UI under src/components/asset-tree/ (TreeExplorer with
> expand/collapse, breadcrumb, icons by typeCode, and create/move/soft-delete actions with a parent
> selector). Add hooks src/pages/inspections/hooks/use-asset-nodes.ts (useAssetTree(locationId),
> usePlanTree(planId), useCreateAssetNode, useMoveAssetNode, useDeleteAssetNode) using apiClient +
> TanStack Query per CLAUDE.md conventions. Then:
> - Replace the inspection detail "Assets" tab (apps/portal/src/pages/inspections/components/assets-tab.tsx)
>   with the tree of the plan's working tree (scope locations flagged); the "add asset" modal must pre-fill
>   the parent selector with the single scope location if there is exactly one, else the plan's root LOCATION
>   node, editable by the user.
> - Update the floor-plan tab's location selector to use LOCATION nodes from the tree.
> - Add an inspection-tree section + extended inspection fields (technicalData driven by the INSPECTION-scoped
>   LocationTypeDefinition) to the CRM Location detail page.
> Follow the DetailPageLayout / StatusBadge / useConfirm / shared-lib conventions. Run vitest and fix failures.
> ```

### Fase 5 — Seed, tests, docs
**Doel:** demo werkt end-to-end op het nieuwe model; CLAUDE.md klopt weer.

- `prisma/seed.ts`: bouw een echte boom — wortel-LOCATION-node ↔ demo-CRM-Location, 1–2 sub-locaties, 2 assets; findings/metingen met `inspectionPlanId` + `assetNodeId`; demo-plan krijgt `locationId` + één `InspectionPlanLocation` scope-rij. Opruimvolgorde (kinderen eerst) bijwerken.
- E2E: `assets.e2e`/`inspection-locations.e2e` herschrijven naar `asset-nodes.e2e`; `cross-tenant.e2e` uitbreiden met node-FK-aanvallen (vreemde `parentId`/`rootLocationId`/`assetNodeId`).
- `CLAUDE.md`: modellenaantal (126 → nieuw), modulelijst (`asset-nodes` i.p.v. `assets`+`inspection-locations`), seed-opruimvolgorde, en de nieuwe gotcha "assets zijn persistent, niet plan-gescopet".

> **Prompt 5 (seed + tests + docs):**
> ```
> Update apps/api/prisma/seed.ts to build a real AssetNode tree for the demo org: a root LOCATION node
> linked 1:1 to the demo CRM Location, 1-2 child LOCATION nodes, and 2 ASSET nodes under them; set the
> demo inspection plan's locationId (hoofdlocatie) and add one InspectionPlanLocation scope row pointing at
> a child LOCATION node; seed findings and a measurement-sheet record referencing assetNodeId +
> inspectionPlanId. Fix the cleanup order: delete inspectionPlanLocation and the execution records before
> assetNode; AssetNode is self-referential so delete children before parents (or a single deleteMany after
> all FK referrers are gone). Rewrite the assets/inspection-locations e2e suites into asset-nodes.e2e-spec.ts
> and extend cross-tenant.e2e-spec.ts with AssetNode FK-injection attacks (foreign
> parentId/rootLocationId/assetNodeId/scope assetNodeId must 403). Update CLAUDE.md: model count, module list
> (asset-nodes replaces assets + inspection-locations), seed cleanup order, and add a gotcha that assets are
> now persistent and decoupled from inspection plans. Run `npx turbo run build`, `cd apps/api && pnpm test
> && pnpm test:e2e` and fix failures.
> ```

---

## 6. Volgorde & afhankelijkheden (samengevat)

```
Fase 0 (ADR/contract)  ──►  Fase 1 (schema/migratie)  ──►  Fase 2 (API)  ──►  Fase 4 (portal)
                                                       └──►  Fase 3 (sync)  ──►  PWA-companion (aparte repo)
Fase 5 (seed/tests/docs) loopt mee met 1–4 en sluit af na 2/3.
```

PWA-cutover (Inspexi-App) is een **harde** afhankelijkheid van Fase 3 en moet in lockstep: zolang de PWA nog `inspectionPlanId` op assets stuurt, mag de oude sync-entiteit niet verdwijnen. Vandaar de contract-versiebump.

---

## 7. Risico's & aandachtspunten

1. **Sync-contract is breaking (grootste risico).** Assets ontkoppelen van het plan verandert het `/sync`-v2-contract waar de PWA op draait. Mitigatie: contractversiebump + overgangsperiode waarin de backend zowel oude (plan-gescopete) als nieuwe (node) payloads accepteert, of een harde cutover gecoördineerd met de `feat/pwa-v2-sync-contract`-branch. **Niet mergen zonder PWA-companion.**
2. **ltree-complexiteit (besloten implementatie).** Prisma kent ltree niet native → `path` is `Unsupported("ltree")?` en is **niet querybaar via Prisma Client**; alle boom-/ancestor-/descendant-queries en de `move` gaan via `$queryRaw`. Aandachtspunten: (a) labels mogen geen `-` bevatten → hyphen-stripped UUID's; (b) path/depth worden door een DB-trigger gevuld, dus de migratie-SQL moet handmatig worden aangevuld (extensie + trigger + GiST-index) bovenop wat `prisma migrate` genereert; (c) een `move` herschrijft descendant-paths met een raw `UPDATE ... subpath(...)`; (d) de seed/tests mogen niet aannemen dat `path` via Prisma terugkomt. Dit is bewust gekozen (MAIC-getrouw, snelle subtree-queries) i.r.t. de extra raw-SQL-onderhoudslast.
3. **Floor-plan/markers structuur-vs-uitvoering.** Plattegrond is persistent op de node; finding-markers zijn per inspectie. v1 filtert finding-markers in de UI op de actieve inspectie; als plattegronden per inspectie moeten verschillen is een latere `inspectionPlanId` op `LocationImage` nodig (§3.4-notitie).
4. **Type-constraint-gat locatie→asset.** De bestaande `AssetTypeConstraint` kent alleen asset→asset parents; een asset direct onder een locatie zou daardoor afgewezen worden. Regel: locatie→asset is altijd toegestaan; asset→asset blijft constraint-gevalideerd (§3.1.5). Expliciet implementeren, niet vergeten.
5. **Ensure-root-node race.** Twee gelijktijdige inspecties op dezelfde nieuwe locatie kunnen beide een wortelnode willen maken. Mitigatie: `rootLocationId @unique` + upsert/`ON CONFLICT`-achtige create in een transactie.
6. **`migrate dev` discipline.** Eén nette migratie vanuit `apps/api/`; **nooit** `db push` (zie de bestaande P3006-gotcha in CLAUDE.md). Dev draait op seed-data, dus geen prod-datamigratie nodig — big-bang is verantwoord.
7. **`LocationTypeScope` semantiek.** Na deze wijziging: `scope = CRM`-types beschrijven het objecttype van de CRM-`Location`; `scope = INSPECTION`-types beschrijven sub-locatie-nodes in de boom. De wortelnode kan beide werelden raken (het is de CRM-locatie én de boom-wortel) — kies bij seed/UI bewust welk type-domein de wortel toont.
8. **Deellocatie-scope discipline.** Alle `scopeLocations` moeten in dezelfde hoofdlocatie-boom zitten (`rootLocationId = plan.locationId`) en `nodeType = LOCATION` zijn. Een verplaatsing (`move`) van een scope-node naar een andere boom moet de scope-koppeling invalideren of blokkeren — afdwingen in de service.

---

## 8. Besliste punten (rev. 2)

De vier open vragen uit rev. 1 zijn beantwoord en verwerkt:

1. **Inspectie ≠ één locatie.** Een inspectie hoort bij één **hoofdlocatie** (CRM-Locatie = boom-wortel) en wordt uitgevoerd op **één of meer deellocaties** dieper in de boom → `InspectionPlan.locationId` (hoofdlocatie) **+** join-tabel `InspectionPlanLocation` (deellocaties). Verwerkt in §3.3.
2. **`Asset.locationId` gaat op in `parentId`.** Akkoord: een asset hangt voortaan altijd via `parentId` onder een locatie- of asset-node; geen apart `locationId`-veld meer. Verwerkt in §3.4.
3. **Compat-wrappers + PWA-cutoverdoc.** `assets`/`inspection-locations` endpoints blijven tijdelijk als wrappers; Fase 3 levert verplicht `docs/fase3/PWA-CUTOVER-ASSET-NODE.md`. Verwerkt in §5 Fase 2/3.
4. **ltree vanaf de start.** Materialised path via PostgreSQL `ltree` (niet string-path). Verwerkt in §3.1 en §7.2.

Nog wél even te bevestigen vóór Fase 1 (kleine punten):

- **Mag een asset óók als losse subboom direct onder de hoofdlocatie-wortel hangen** wanneer er meerdere deellocaties in scope zijn maar de gebruiker bewust de wortel kiest? (Aanname: ja, de parent-selector staat dat toe.)
- **Floor-plan per inspectie of persistent?** Nu: persistent op de LOCATION-node, finding-markers gefilterd op de actieve inspectie (§3.4-notitie). Akkoord, of moet een plattegrond per inspectie kunnen verschillen?

Zeg maar of deze twee kloppen, dan is het plan klaar om in Claude Code uit te voeren vanaf Fase 0.
