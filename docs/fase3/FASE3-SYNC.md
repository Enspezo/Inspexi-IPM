# Fase 3 — Sync (PWA-koppeling), v2-contract

Concrete uitwerking van **Fase 3**: de offline sync tussen de PWA (`Inspexi-App/apps/inspectie-app`, aparte repo) en de geïntegreerde Beheer-API. De PWA blijft een aparte app maar praat met dezelfde database/schema.

## 0. Belangrijke bevinding (waarom v2)

De bestaande contracten liepen niet gelijk:
- De **App-server** (`sync.service.ts`) gebruikte een flat `changes[]`-array met `entityType`/`baseVersion` en gaf pull terug als `changes[entity]={created,updated,deleted}`.
- De **PWA** (`syncApi.ts`) verwacht een **entiteit-gegroepeerde, camelCase** vorm en stuurt de volledige lokale records.
- De PWA's gedeelde types lopen bovendien achter op beide Prisma-schema's (`status`/`clientId`/`organizationId`/`classification`/`description` i.p.v. `statusCode`/`contactId`/`orgId`/`classificationValues`/`shortDescription`).

**Keuze (vastgesteld): schoon v2-contract, PWA bijwerken.** Server én PWA lijnen uit op het Beheer-schema. Geen permanente vertaallaag-schuld; wel een eenmalige PWA-aanpassing.

Deliverables:
- `code/sync/` — sync-module (dto, mapper, service, controller, module).
- `code/photos/` — `/photos/upload` + `/photos/:id/download` (R2/lokaal via `STORAGE_PROVIDER`).
- §3 PWA-wijzigingen (aparte repo) + §5/§6 Claude Code-prompts.

---

## 1. v2-contract (autoritatief)

Alle responses in Beheer-envelope `{ success, data }`. Auth = **interne user-JWT** (niet de client-realm). `X-Device-ID`-header of `deviceId` in body.

### GET /api/v1/sync/pull?since=&lt;ISO&gt;
```jsonc
{ "success": true, "data": {
  "inspectionPlans": [ /* volledige records, Beheer-veldnamen: orgId, contactId, statusCode, normTypeCode, inspectionTypeCode, addressStreet... */ ],
  "assets":          [ /* ... statusCode, inspectionPlanId, parentAssetId, technicalData ... */ ],
  "findings":        [ /* ... statusCode, classificationValues, shortDescription ... */ ],
  "photos":   [ { "id","entityType":"asset|finding|inspectionPlan","entityId","url","thumbnailUrl" } ],
  "contacts": [ { "id","orgId","name" } ],            // read-only referentie (naamweergave)
  // ── Additief (REQ1 interne chat) — membership-scoped (DIRECT: deelnemer, TEAM: rol) ──
  "chatThreads":  [ { "id","type":"DIRECT|TEAM","teamRole","subject","status","referenceEntityType","referenceEntityId","createdById","createdAt","updatedAt" } ],
  "chatMessages": [ { "id","threadId","senderId","content","mentionedUserIds","referenceEntityType","referenceEntityId","createdAt","updatedAt" } ],
  "users":        [ { "id","firstName","lastName","initials","availability","availabilityNote","lastSeenAt" } ],  // presence
  "deletedIds": { "inspectionPlans":[], "assets":[], "findings":[], "chatThreads":[], "chatMessages":[] },  // tombstones (deletedAt > since); chat-keys additief
  "serverTime": "ISO"
} }
```
`since` leeg → alles (eerste sync). Alleen records van de eigen org (superuser ziet alles).

> **REQ1 — interne chat (additief, contract niet gebroken).** Bestaande keys/typen zijn ongewijzigd; `chatThreads`/`chatMessages`/`users` en de twee chat-keys in `deletedIds` zijn nieuw — een oude PWA negeert onbekende keys. Chat in pull is **read-only** en strikt **membership-scoped** (een inspecteur ziet alleen eigen DIRECT-threads + zijn rol-teamkanalen; nooit DIRECT-threads van anderen). Presence (`users`) is de hele org-staf.

### POST /api/v1/sync/push
```jsonc
{ "deviceId":"...", "clientTime":"ISO", "changes": {
  "inspectionPlans": [ { "operation":"create|update|delete", "data": { /* volledig record, incl. id (client-UUID) */ } } ],
  "assets":   [ ... ],
  "findings": [ ... ],
  // ── Additief (REQ1) — chat-berichten van de PWA-inspecteur ──
  "chatMessages": [ { "operation":"create|delete", "data": { "id":"client-UUID","threadId","content","mentionedUserIds?","referenceEntityType?","referenceEntityId?","deviceId?" } } ]
} }
```
Response:
```jsonc
{ "success": true, "data": {
  "processed": { "inspectionPlans": N, "assets": N, "findings": N, "chatMessages": N },  // chatMessages additief
  "conflicts": [ { "entityType":"inspectionPlan|asset|finding", "entityId","clientData","serverData" } ],
  "errors":    [ { "entityType","entityId","error" } ],
  "serverTime": "ISO"
} }
```

> **Chat-push (REQ1).** `chatMessages` lopen **niet** via de generieke mutator maar via `ChatService.sendMessage`, zodat membership-autorisatie (alleen posten in eigen threads), notificatie-dispatch (@mentions + nieuw-bericht, gededupliceerd) en read-state identiek aan de REST-flow blijven. **Idempotent** op het client-`id` (replay-veilig). `delete` doet een soft-delete van een **eigen** bericht (verschijnt als tombstone in de volgende pull). Threads worden **niet** via push aangemaakt — die worden server-side (portal) geprovisioneerd; de PWA antwoordt in bestaande threads.

### POST /api/v1/sync/resolve
```jsonc
{ "deviceId":"...", "resolutions": [ { "entityType","entityId","resolution":"client|server|merge","mergedData?":{} } ] }
→ { "success": true, "data": { "resolved": N, "errors": [...] } }
```

### POST /api/v1/photos/upload  (multipart)
velden: `file`, `entityType` (asset|finding|inspectionPlan), `entityId`, `caption?`, `capturedAt?`, `gpsLatitude?`, `gpsLongitude?`
→ `{ success, data: { id, url, thumbnailUrl } }`. Download: `GET /api/v1/photos/:id/download` (auth, org-scoped stream).

---

## 2. Server-ontwerp (`code/sync/` + `code/photos/`)

- **Tenant-veilig**: `orgId` wordt NOOIT door de client gezet — de service injecteert die uit de hiërarchie (`inspectionPlan` → user.orgId; `asset` → via `inspectionPlanId`; `finding` → via `assetId`) en valideert de parent-FK met `assertSameOrg`. Pull/update/delete scopen via `orgScope(user)`.
- **Whitelist** (`sync-mapper.ts`): nooit blind `...data` in Prisma — alleen toegestane scalars per entiteit + datum-coercie. `id`/`orgId`/`_pendingSync` worden genegeerd.
- **Conflict**: optimistic — bij `update` is er een conflict als `server.updatedAt > client.syncedAt`. Conflict wordt in `SyncQueue` (`status=conflict`, `conflictData`) bewaard en teruggegeven; niet toegepast. `resolve` past client/server/merge toe en zet de queue op `completed`.
- **Soft-delete**: `operation:"delete"` → `deletedAt = now` (tombstone voor de volgende pull van andere devices).
- **Foto's**: opslag via `STORAGE_PROVIDER` (lokaal of R2), key `{orgId}/photos/{uuid}.{ext}`, MIME-whitelist (jpeg/png/webp), max 25MB. Download streamt org-scoped (geen publieke R2-URL nodig; signed URLs blijven optioneel voor Fase 4).
- **Registratie**: `SyncModule` + `PhotosModule` in `app.module.ts`. `Photo` is al in `AUDITED_MODELS`? Nee — sync/queue niet auditen; `Photo` optioneel.

**Bewust buiten scope (bevestigen met PWA-team)**: de huidige PWA pusht alleen `inspectionPlans/assets/findings`. `visualInspections`/`measurementRecords`/`signatures` worden (nog) niet via push gesynct — voeg ze toe aan `SYNC_ENTITIES` zodra de PWA ze meestuurt. `measurement-sheet-records` heeft een eigen endpoint (Fase 2), geen sync nodig.

---

## 3. PWA-wijzigingen (aparte repo: `Inspexi-App/apps/inspectie-app` + `packages/shared`)

Lijn de PWA uit op de Beheer-veldnamen. Dit is een eenmalige migratie in de PWA-repo:

1. **Shared types** (`packages/shared/src/types`): hernoem op `InspectionPlan`/`Asset`/`Finding`:
   - `organizationId` → `orgId`; `clientId` → `contactId`; `status` → `statusCode` (string); `normType` → `normTypeCode` (string).
   - `inspectionType` → `inspectionTypeCode` (string).
   - InspectionPlan: `address: Address` + `gpsCoordinates` → **flat** `addressStreet/addressHouseNumber/addressPostalCode/addressCity` + `gpsLatitude/gpsLongitude`.
   - Finding: `description`/`descriptionCustom` → `shortDescription`/`longDescription`; **`classification` (enum) → `classificationValues` (Record<string,string>)**.
2. **Dexie** (`services/db/index.ts`): bump schema-versie + migratie die bestaande lokale records naar de nieuwe velden mapt (status→statusCode, etc.). Indexen die op oude veldnamen wezen bijwerken.
3. **`services/api/syncApi.ts`**: `SyncPullResponse`/`SyncPushRequest`/`SyncPushResponse` aanpassen aan §1 (incl. `contacts` i.p.v. `clients`, `statusCode`-velden). `uploadPhoto` `entityType` blijft `asset|finding|inspectionPlan` (camelCase — past al).
4. **`services/syncService.ts`**: push bouwt al per-entiteit groepen — alleen de veldnamen in de `data` volgen automatisch uit de types. Conflict-afhandeling: stuur `syncedAt` mee in `data` (server gebruikt dat als base-version).
5. **Classificatie-UI**: het zwaarste punt — de PWA moet het classificatiemodel ophalen (`GET /api/v1/classification-models` of via inspection-template) en constateringen classificeren met `classificationValues` i.p.v. de oude enum. Reference-data caches uitbreiden.
6. **API-base-URL**: wijs naar de geïntegreerde API (eigen endpoint/host), envelope `{success,data}` blijft gelijk.

> Tip: doe dit als aparte PR in de PWA-repo, met een Dexie-migratietest (oude → nieuwe veldnamen) en een offline round-trip-test tegen een dev-instance van de Beheer-API.

---

## 4. Verificatie

- API: `tsc --noEmit` groen; unit-specs voor sync (push create/update/delete, conflict, resolve) + photos (upload mime/te-groot, download org-scope).
- E2E: pull→push round-trip; **cross-tenant**: device van org A pusht een `inspectionPlanId`/`assetId` van org B → `error`/403, nooit geschreven.
- Conflict-pad: twee updates met verouderde `syncedAt` → conflict in response + `SyncQueue`-rij; `resolve` lost op.
- Foto: upload → `Photo`-rij met juiste `orgId`; download alleen binnen eigen org.
- PWA (aparte repo): Dexie-migratie + offline round-trip groen.

---

## 5. Prompt F — Claude Code: server sync + photos (Beheer-repo)

```
Doel: implementeer Fase 3 server-side (sync v2 + photos) in apps/api.
Lees eerst: docs/fase3/FASE3-SYNC.md (§1 contract, §2 ontwerp) en docs/fase3/code/.

Stappen:
1. Maak src/modules/sync/ (dto, sync-mapper, service, controller, module) uit docs/fase3/code/sync.
2. Maak src/modules/photos/ (dto, service, controller, module) uit docs/fase3/code/photos.
3. Registreer SyncModule + PhotosModule in app.module.ts. (StorageModule is @Global — niet importeren.)
4. Unit-specs: sync.service (create/update/delete, conflict-detectie, resolve client/server/merge,
   orgId-injectie + assertSameOrg) en photos.service (mime-whitelist, org-scope, download).
5. E2E: test/sync.e2e-spec.ts (pull/push/resolve round-trip) + uitbreiding cross-tenant.e2e-spec.ts
   (push met vreemde org-FK → error, nooit geschreven). photos.e2e: upload + org-scoped download.

Constraints:
- Auth = interne user-JWT; @Roles incl. INSPECTEUR. orgId NOOIT van de client (server injecteert).
- Nooit blind data spreaden — gebruik de whitelist in sync-mapper.ts.
- deletedAt-tombstones; conflict via server.updatedAt > client.syncedAt.
- Houd het contract uit §1 EXACT (de PWA-PR in Prompt G rekent erop).

Definition of done: `npx turbo run build` groen; unit + e2e + cross-tenant groen.
Commit: `feat: sync v2 + photo upload (Fase 3)`.
```

## 6. Prompt G — Claude Code: PWA uitlijnen op v2 (Inspexi-App-repo)

```
Doel: lijn de PWA (apps/inspectie-app + packages/shared) uit op het v2-synccontract.
Lees eerst: docs/fase3/FASE3-SYNC.md §1 (contract) + §3 (PWA-wijzigingen) in de Beheer-repo,
en de huidige PWA-bestanden services/api/syncApi.ts, services/syncService.ts, services/db/index.ts.

Stappen (zie §3 voor details):
1. Hernoem de velden in packages/shared/src/types (status→statusCode, clientId→contactId,
   organizationId→orgId, normType→normTypeCode, inspectionType→inspectionTypeCode,
   address-object→flat addressStreet/..., Finding.description→shortDescription,
   classification-enum→classificationValues).
2. Bump de Dexie-schemaversie + schrijf een upgrade-migratie die bestaande lokale records remapt.
3. Werk syncApi.ts (pull/push/resolve types) en syncService.ts bij; stuur syncedAt mee in push-data.
4. Pas de classificatie-UI aan: haal classification-models op en gebruik classificationValues.
5. Wijs VITE_API_URL naar de geïntegreerde Beheer-API.

Definition of done: typecheck + build groen; Dexie-migratietest (oud→nieuw) en een offline
round-trip (create offline → push → pull op tweede device) tegen een dev-Beheer-API slagen.
Aparte PR in de PWA-repo.
```

---

## 7. Aandachtspunten
- **Contract is nu autoritatief gedocumenteerd** (§1) — server (Prompt F) en PWA (Prompt G) moeten beide hierop landen; doe Prompt F eerst zodat de PWA tegen een echte API kan testen.
- **Classificatie** is de zwaarste PWA-wijziging (enum → model) — plan die apart.
- **vi/mr/signatures-sync** is bewust nog niet meegenomen; bevestig met het PWA-team of/wanneer die via push moeten.
- **Thumbnails + signed URLs** blijven Fase 4 (nu: download-route, thumbnailPath = origineel).
