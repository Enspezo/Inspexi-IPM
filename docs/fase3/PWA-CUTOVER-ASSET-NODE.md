# PWA-cutover — unified AssetNode tree (sync-contract v3)

Hand-off voor de **PWA-repo** (`../Inspexi-App`, `apps/inspectie-app` + `packages/shared`).
Dit document beschrijft het nieuwe **v3 sync-contract** dat de Beheer-API nu serveert
(`apps/api/src/modules/sync`), en hoe je de PWA migreert. **Wijzig niets in de Beheer-repo
op basis van dit document** — die kant is af; dit is puur de PWA-instructie.

> Status Beheer-API: v3 staat live op `feat/unified-asset-node-tree`. `pull` geeft
> `contractVersion: 3` terug. Server + unit/e2e (`sync.service.spec`, `sync.e2e`,
> `chat-sync.e2e`, cross-tenant sync-push) zijn groen.

---

## 0. TL;DR — wat verandert er

1. **`assets` + `locations` → één `assetNodes`-boom.** De losse `assets`- en
   `locations`-stores verdwijnen; er komt één recursieve `assetNodes`-store
   (`nodeType: 'LOCATION' | 'ASSET'`). Een LOCATION-node is de boom-wortel
   (`parentId = null`, optioneel `rootLocationId` → CRM-Location); ASSET-nodes hangen
   via `parentId` onder een LOCATION (of een andere ASSET).
2. **`orgId` komt overal van de server (org-from-self).** De PWA stuurt nooit `orgId`.
   Elke entiteit heeft een eigen `orgId`-kolom; de server injecteert die uit de
   ingelogde gebruiker. Cross-tenant FK's (parentId, assetNodeId, inspectionPlanId…)
   worden server-side geweigerd (`error`, nooit geschreven).
3. **Veldhernoemingen op de node** (oud → nieuw):
   - `parentAssetId` → **`parentId`**
   - `assetType` → **`typeCode`**
   - `locationDescription` → **`description`**
4. **Geen `inspectionPlanId` / `locationId` meer op de node.** De boom hangt niet aan
   een plan; hij hangt aan `parentId`/`rootLocationId`. (De koppeling "welke locaties
   horen bij welke inspectie" loopt server-side via `InspectionPlanLocation` — niet via
   sync.)
5. **`locationId` op het plan is nieuw én verplicht in de praktijk:** het plan draagt nu
   de **hoofdlocatie** (`InspectionPlan.locationId`). De PWA moet die meesturen.
6. **ltree `path`/`depth` zitten NIET in het contract.** Die worden door een DB-trigger
   onderhouden. Stuur ze niet mee; lees ze niet.
7. **Vier nieuwe uitvoerings-entiteiten** syncen nu volwaardig (create/update/delete):
   `visualInspections`, `measurementRecords`, `measurementSheetRecords`,
   `standaloneMeasurements`.
8. **`contractVersion: 3`** in elke pull-respons — gebruik dit als guard.

---

## 1. Het v3-contract (autoritatief: zie ook `FASE3-SYNC.md` §1 voor de v2-basis)

### 1.1 `GET /sync/pull?since=<ISO>`

```jsonc
{ "success": true, "data": {
  "contractVersion": 3,
  "inspectionPlans":         [ /* …, locationId, … */ ],
  "assetNodes":              [ /* LOCATION + ASSET nodes, zie 1.3 */ ],
  "findings":                [ /* …, assetNodeId, inspectionPlanId, … */ ],
  "visualInspections":       [ /* … */ ],
  "measurementRecords":      [ /* … */ ],
  "measurementSheetRecords": [ /* … */ ],
  "standaloneMeasurements":  [ /* … incl. genest "values": [...] */ ],
  "measurementInstruments":  [ /* pull-only referentie (ongewijzigd) */ ],
  "userDefaultInstrumentIds":[ ... ],
  "photos":   [ { "id","entityType","entityId","url","thumbnailUrl" } ],
  "contacts": [ { "id","orgId","name" } ],
  "chatThreads": [...], "chatMessages": [...], "users": [...],   // additief (ongewijzigd)
  "deletedIds": {
    "inspectionPlans":[], "assetNodes":[], "findings":[],
    "visualInspections":[], "measurementRecords":[],
    "measurementSheetRecords":[], "standaloneMeasurements":[],
    "measurementInstruments":[], "chatThreads":[], "chatMessages":[]
  },
  "serverTime": "ISO"
} }
```

> **Breaking t.o.v. v2:** key `assets` → `assetNodes` (zowel in de body als in
> `deletedIds`). De vier uitvoerings-keys + hun `deletedIds` zijn nieuw. Een oude PWA die
> `data.assets` leest krijgt `undefined`. Daarom: **eerst de PWA migreren, dan pas tegen
> v3 syncen** (of guard op `contractVersion`).

### 1.2 `POST /sync/push`

```jsonc
{ "deviceId":"...", "clientTime":"ISO", "changes": {
  "inspectionPlans":         [ { "operation":"create|update|delete", "data": { /* incl. locationId */ } } ],
  "assetNodes":              [ ... ],
  "findings":                [ ... ],
  "visualInspections":       [ ... ],
  "measurementRecords":      [ ... ],
  "measurementSheetRecords": [ ... ],
  "standaloneMeasurements":  [ ... ],
  "chatMessages":            [ ... ]   // additief, ongewijzigd (ChatService)
} }
```
Response `processed` bevat per entiteit-key een teller (plus `chatMessages`). `conflicts`
en `errors` ongewijzigd qua vorm.

### 1.3 `assetNodes` — toegestane velden (whitelist)

De server accepteert **alleen** deze scalars (de rest wordt genegeerd):

| veld | type | opmerking |
|---|---|---|
| `id` | uuid | client-UUID |
| `nodeType` | `'LOCATION' \| 'ASSET'` | verplicht bij create |
| `parentId` | uuid? | `null` = wortel; cross-tenant geweigerd |
| `rootLocationId` | uuid? | **alleen op de wortel**; 1:1 → CRM-Location; cross-tenant geweigerd |
| `typeCode` | string | was `assetType` (asset) / `objectType` (locatie) |
| `name` | string | |
| `identifier` | string? | |
| `description` | string? | was `locationDescription` |
| `technicalData` | json | custom velden per type-definitie |
| `statusCode` | string | vnl. voor ASSET (`new`, …) |
| `notes` | string? | |
| `sortOrder` | int | |
| `createdBy` | uuid? | |
| `deviceId` | string? | |

**Nooit meesturen:** `orgId`, `path`, `depth` (trigger/server), en **geen**
`inspectionPlanId`/`locationId` op de node.

### 1.4 `findings` — wijzigingen

- `assetId` → **`assetNodeId`** (verplicht, → een ASSET-node).
- **`inspectionPlanId`** nieuw en verplicht.
- Overige velden ongewijzigd (`shortDescription`, `classificationValues`, …).

### 1.5 Uitvoerings-entiteiten — kernvelden

Alle vier hebben een eigen `orgId` (server-injected) + `assetNodeId` + `inspectionPlanId`
(behalve `standaloneMeasurements`, zie hieronder) en syncen met soft-delete-tombstones.

- **`visualInspections`**: `assetNodeId`, `inspectionPlanId`, `status`,
  `checklistResults` (json), `startedAt`, `completedAt`, `inspectorId`, `deviceId`.
  *Geen `createdBy`-kolom* — stuur die niet.
- **`measurementRecords`**: `assetNodeId`, `inspectionPlanId`, `status`,
  `measurements` (json), `instrumentType`, `instrumentSerial`, `calibrationDate`,
  `startedAt`, `completedAt`, `inspectorId`, `deviceId`. *Geen `createdBy`.*
- **`measurementSheetRecords`**: `templateId`, `assetNodeId`, `inspectionPlanId`,
  `templateVersion`, `templateSnapshot` (json), `status`, `data` (json),
  `usedInstrumentIds` (uuid[]), `finalCheckExecuted`, `finalCheckPassed`,
  `finalCheckResults` (json), `completedAt`, `createdBy` (**verplicht**), `deviceId`.
- **`standaloneMeasurements`**: hangt aan een **LOCATION-node**, niet aan `assetNodeId`.
  Velden: `inspectionPlanId`, **`locationNodeId`** (LOCATION-node), `measurementType`,
  `description`, `linkedAssetNodeId?` (optionele ASSET-node), `sampleId?`, `createdBy`,
  `deviceId`. De waarde-rijen reizen **genest** mee (zie 1.6).

### 1.6 `StandaloneMeasurementValue` — genest in de payload

De waarde-rijen hebben geen eigen `orgId`/`syncedAt`/`deletedAt` en zijn waarde-objecten
van hun meting. Ze reizen daarom **genest** in het `standaloneMeasurement`-record onder de
key `values` (geen aparte sync-entiteit):

```jsonc
{ "operation":"create", "data": {
  "id":"<client-uuid>", "inspectionPlanId":"…", "locationNodeId":"…",
  "measurementType":"isolation",
  "values": [
    { "fieldName":"R_iso", "fieldType":"number", "value":"500", "unit":"MΩ", "passFailCode":"pass" }
  ]
} }
```

Semantiek: **replace-on-write**. Bij een `update` waarin `values` is meegestuurd vervangt
de server álle bestaande waarde-rijen door de nieuwe set (`deleteMany` + `create`). Laat je
`values` wég, dan blijven de bestaande rijen ongemoeid. Velden buiten de whitelist
(`fieldName`, `fieldType`, `value`, `unit`, `passFailCode`) worden genegeerd.

### 1.7 Conflict & resolve — ongewijzigd

Optimistic op `server.updatedAt > client.syncedAt`. Stuur `syncedAt` mee in elke
update-`data`. `resolve` (`client|server|merge`) ongewijzigd; `entityType` in een
resolutie is de **singular** key: `inspectionPlan`, `assetNode`, `finding`,
`visualInspection`, `measurementRecord`, `measurementSheetRecord`,
`standaloneMeasurement`.

---

## 2. Dexie-migratie v9 → v10 (PWA)

Doel: de twee stores `assets` en `locations` samensmelten tot één `assetNodes`-store, en
de drie veldhernoemingen toepassen.

### 2.1 Schema

```ts
// services/db/index.ts
this.version(10).stores({
  // weg: assets, locations
  assetNodes: 'id, orgId, parentId, rootLocationId, nodeType, _pendingSync, deletedAt',
  inspectionPlans: 'id, orgId, locationId, statusCode, _pendingSync, deletedAt',
  findings: 'id, orgId, assetNodeId, inspectionPlanId, _pendingSync, deletedAt',
  visualInspections: 'id, orgId, assetNodeId, inspectionPlanId, _pendingSync, deletedAt',
  measurementRecords: 'id, orgId, assetNodeId, inspectionPlanId, _pendingSync, deletedAt',
  measurementSheetRecords: 'id, orgId, assetNodeId, inspectionPlanId, _pendingSync, deletedAt',
  standaloneMeasurements: 'id, orgId, inspectionPlanId, locationNodeId, _pendingSync, deletedAt',
  // overige stores (photos, contacts, chat, instruments…) ongewijzigd
}).upgrade(async (tx) => {
  const locations = await tx.table('locations').toArray().catch(() => []);
  const assets = await tx.table('assets').toArray().catch(() => []);
  const nodes = tx.table('assetNodes');

  // LOCATION-nodes (wortels): objectType → typeCode, locationDescription → description
  for (const l of locations) {
    await nodes.put({
      id: l.id,
      orgId: l.orgId,
      nodeType: 'LOCATION',
      parentId: l.parentLocationId ?? null,
      rootLocationId: l.crmLocationId ?? l.rootLocationId ?? null,
      typeCode: l.objectType ?? l.typeCode ?? 'location',
      name: l.name,
      identifier: l.identifier ?? null,
      description: l.locationDescription ?? l.description ?? null,
      technicalData: l.technicalData ?? {},
      statusCode: l.statusCode ?? 'new',
      notes: l.notes ?? null,
      sortOrder: l.sortOrder ?? 0,
      createdBy: l.createdBy ?? null,
      deviceId: l.deviceId ?? null,
      syncedAt: l.syncedAt ?? null,
      deletedAt: l.deletedAt ?? null,
      _pendingSync: l._pendingSync ?? false,
    });
  }

  // ASSET-nodes: parentAssetId → parentId, assetType → typeCode, locationDescription → description.
  // Een asset die voorheen alleen aan een locatie hing (locationId) krijgt die locatie als parent.
  for (const a of assets) {
    await nodes.put({
      id: a.id,
      orgId: a.orgId,
      nodeType: 'ASSET',
      parentId: a.parentAssetId ?? a.locationId ?? null,
      rootLocationId: null,
      typeCode: a.assetType ?? a.typeCode ?? 'asset',
      name: a.name,
      identifier: a.identifier ?? null,
      description: a.locationDescription ?? a.description ?? null,
      technicalData: a.technicalData ?? {},
      statusCode: a.statusCode ?? 'new',
      notes: a.notes ?? null,
      sortOrder: a.sortOrder ?? 0,
      createdBy: a.createdBy ?? null,
      deviceId: a.deviceId ?? null,
      syncedAt: a.syncedAt ?? null,
      deletedAt: a.deletedAt ?? null,
      _pendingSync: a._pendingSync ?? false,
    });
  }

  // findings: assetId → assetNodeId (inspectionPlanId bestond meestal al; anders afleiden).
  await tx.table('findings').toCollection().modify((f: any) => {
    if (f.assetId && !f.assetNodeId) { f.assetNodeId = f.assetId; delete f.assetId; }
  });
});
```

> Schrap de oude `assets`/`locations`-stores pas nadat v10 in productie heeft gedraaid en
> je zeker weet dat de upgrade liep (Dexie laat een niet-gedeclareerde store automatisch
> vallen zodra je hem niet meer in `.stores({...})` opneemt).

### 2.2 Migratietest

Schrijf een Dexie-migratietest (v9-fixture → v10): seed één locatie + één asset + één
finding in de oude stores, draai de upgrade, assert dat `assetNodes` 2 rijen heeft met
`nodeType` LOCATION/ASSET, dat `typeCode`/`description`/`parentId` correct gemapt zijn, en
dat de finding `assetNodeId` heeft.

---

## 3. Shared types (PWA `packages/shared`)

- Vervang `Asset` + `InspectionLocation`/`Location` door één **`AssetNode`**:
  `{ id, orgId, nodeType, parentId, rootLocationId, typeCode, name, identifier,
  description, technicalData, statusCode, notes, sortOrder, createdBy?, deviceId?,
  syncedAt?, deletedAt? }`. **Geen** `path`/`depth` in het PWA-type (server-only).
- `InspectionPlan`: voeg **`locationId`** toe.
- `Finding`: `assetId` → `assetNodeId` (+ `inspectionPlanId`).
- Voeg types toe voor `VisualInspection`, `MeasurementRecord`,
  `MeasurementSheetRecord`, `StandaloneMeasurement` (+ geneste
  `StandaloneMeasurementValue`).

## 4. Sync-laag (PWA `services/api/syncApi.ts` + `services/syncService.ts`)

- `SyncPullResponse`: `assets` → `assetNodes`; voeg de vier uitvoerings-keys + hun
  `deletedIds` toe; lees `contractVersion`.
- `SyncPushRequest.changes`: `assets` → `assetNodes`; voeg de vier keys toe.
- Push bouwt per-entiteit groepen uit de `_pendingSync`-records per store; veldnamen volgen
  automatisch uit de nieuwe types. **Stuur `syncedAt` mee** in elke update-`data`.
- Bij `standaloneMeasurements`-push: voeg de bijbehorende `values` als geneste array toe.
- **Stuur nooit** `orgId`/`path`/`depth`, en op de node nooit `inspectionPlanId`/`locationId`.

## 5. Offline aanmaken (UX)

- **Asset/locatie offline aanmaken zonder plan-koppeling.** Een node hangt aan de boom,
  niet aan een plan. Maak een ASSET-node met een `parentId` (de LOCATION-node waaronder hij
  valt) of — als hij direct onder de hoofdlocatie hoort — onder de wortel-LOCATION. Een
  nieuwe LOCATION-wortel maak je met `parentId: null` en (indien bekend) `rootLocationId`
  naar de CRM-Location. De server vult `path`/`depth` via de trigger.
- **Hoofdlocatie op het plan.** Zet bij het aanmaken/bewerken van een plan
  `locationId` op de hoofdlocatie (de wortel-LOCATION-node's CRM-Location). Dit is in de
  praktijk verplicht voor een bruikbare inspectie.
- **Findings/metingen** verwijzen naar `assetNodeId` (de node) **en** `inspectionPlanId`
  (de inspectie) — beide nu expliciet.

---

## 6. Cutover-volgorde (met rollback)

> De Beheer-API is **niet** backwards-compatibel met v2 op de `assets`-key. Coördineer de
> overstap; de API-kant staat al op v3.

1. **Branch in de PWA-repo** (`feat/pwa-v3-asset-node`). Niet op `main`.
2. **Types** (§3) aanpassen → typecheck groen.
3. **Dexie v10** (§2) + migratietest groen.
4. **Sync-laag** (§4) + UI (§5) aanpassen → build groen.
5. **`contractVersion`-guard**: bij pull, als `data.contractVersion !== 3`, toon
   "app bijwerken nodig" en blokkeer sync (voorkomt stille dataverlies bij een
   teruggerolde server).
6. **Round-trip test** tegen een dev-Beheer-API: offline locatie+asset+finding+meting
   aanmaken → push → pull op een tweede device → boom + findings verschijnen; delete →
   tombstone in `deletedIds`.
7. **Gefaseerd uitrollen.** Omdat de Dexie-upgrade eenmalig en onomkeerbaar is, eerst een
   kleine testgroep.

### Rollback
- **PWA-kant:** v10-upgrade is forward-only. Roll back door de vorige PWA-build te
  herinstalleren **én** de IndexedDB te wissen (de v10-DB is niet leesbaar door v9).
  Documenteer dit; liever fix-forward.
- **API-kant (Beheer):** terug naar v2 = de `feat/unified-asset-node-tree`-branch niet
  mergen / de vorige API-release herstellen. De `contractVersion`-guard in stap 5 zorgt dat
  een v3-PWA dan netjes stopt i.p.v. tegen v2 te syncen.
- **Schema:** de toegevoegde `deleted_at`-kolommen (VI/MR/MSR) zijn additief en nullable —
  veilig om te laten staan bij een API-rollback.

---

## 7. Verificatie-checklist (PWA-PR)

- [ ] typecheck + build groen
- [ ] Dexie v9→v10 migratietest (locatie+asset+finding → assetNodes + assetNodeId) groen
- [ ] offline round-trip tegen dev-Beheer-API (create/update/delete, tombstones) groen
- [ ] `contractVersion`-guard werkt (gesimuleerde mismatch → blokkade)
- [ ] geen `orgId`/`path`/`depth` in enige push-payload; geen `inspectionPlanId`/`locationId`
      op een node
- [ ] plan-push bevat `locationId`
