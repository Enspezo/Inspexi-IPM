# Fase 1 — Schema-fundament (uitgewerkt)

Dit is de concrete uitwerking van **Fase 1** uit `docs/INTEGRATIE-INSPEXI-APP.md`: het samenvoegen van het Inspexi-App inspectiedomein in het Beheer Prisma-schema, in Beheer-conventies.

Deliverables in deze map:

- **`inspection-domain.prisma`** — paste-ready fragment met alle nieuwe enums + ~50 modellen.
- **`FASE1-SCHEMA.md`** (dit bestand) — de bijbehorende edits op bestaande modellen, beslissingen, seed-/audit-/migratiestappen en een verificatie-checklist.

> Belangrijk: het fragment valideert pas samen met de **back-relations** uit §2. Voeg eerst die toe aan de bestaande modellen in `apps/api/prisma/schema.prisma`, plak daarna het fragment erachter.

---

## 1. Toegepaste conversieregels

| Bron (App) | Doel (Beheer) |
|---|---|
| `String @id @default(uuid())` | `String @id @default(uuid()) @db.Uuid` |
| FK `String` | FK `String … @db.Uuid` |
| `organizationId` / `@map("organization_id")` | `orgId` / `@map("org_id")` |
| `@@map("xxx")` | `@@map("imp_xxx")` |
| `normType NormType` (enum) | `normTypeCode String @map("norm_type")` + lookup `NormTypeDefinition` |
| App `Client` relatie | `Contact` relatie |
| App `Project` relatie | Beheer `Project` relatie |
| `ClientContact` (signatory/installation) | Beheer `ContactPerson` |
| model `Location` | hernoemd → `InspectionLocation` / `imp_inspection_locations` |

**Soft-delete:** het inspectiedomein behoudt **`deletedAt`** (timestamp) i.p.v. Beheer's `isDeleted` boolean. Reden: de sync-pull detecteert verwijderingen via `deletedAt > since` (tombstones). Dit is de **enige** gesanctioneerde afwijking van Beheer-conventie; services filteren expliciet op `deletedAt: null`. (Beheer's eigen modellen blijven `isDeleted`.)

**Tenant-denormalisatie:** `orgId` staat expliciet op alle uitvoerings- en records-tabellen (InspectionPlan, Asset, VisualInspection, MeasurementRecord, Finding, Photo, Signature, Report, InspectionLocation, MeasurementSheetRecord, StandaloneMeasurement, LocationImage, LocationImageMarker, GeneratedDocument, ClientRequest). Zo werkt `assertSameOrg(...)` direct zonder joins. Pure bladtabellen (`StandaloneMeasurementValue`, `MessageAttachment`, `FindingResolutionPhoto`, `DocumentSignature`) blijven transitief gescoped. **Regel:** elke service zet `orgId` bij create gelijk aan `inspectionPlan.orgId` en valideert die met `assertSameOrg`.

---

## 2. Edits op BESTAANDE Beheer-modellen (back-relations)

Prisma vereist beide kanten van elke relatie. Voeg onderstaande regels toe binnen de bestaande modellen in `apps/api/prisma/schema.prisma`.

### 2.1 `Organization` — voeg toe aan het relatieblok

```prisma
  // Inspectiedomein (Fase 1)
  normConfigurations       NormConfiguration[]
  inspectionPlans          InspectionPlan[]
  assets                   Asset[]
  visualInspections        VisualInspection[]
  measurementRecords       MeasurementRecord[]
  findings                 Finding[]
  inspectionPhotos         Photo[]
  inspectionSignatures     Signature[]
  reports                  Report[]
  inspectionLocations      InspectionLocation[]
  checklistItems           ChecklistItem[]
  checklists               Checklist[]
  categories               Category[]
  findingTemplates         FindingTemplate[]
  reportTemplates          ReportTemplate[]
  assetTypeDefinitions     AssetTypeDefinition[]
  locationTypeDefinitions  LocationTypeDefinition[]
  inspectionTemplates      InspectionTemplate[]
  generatedDocuments       GeneratedDocument[]
  measurementSheetRecords  MeasurementSheetRecord[]
  standaloneMeasurements   StandaloneMeasurement[]
  locationImages           LocationImage[]
  locationImageMarkers     LocationImageMarker[]
  clientRequests           ClientRequest[]
  voiceTemplatePrompts     VoiceTemplatePrompt[]
  // Per-org lookup-tabellen (overschrijfbare status/type-lijsten)
  inspectionTypeOptions    InspectionTypeOption[]
  planStatusTypes          PlanStatusType[]
  assetStatusTypes         AssetStatusType[]
  findingStatusTypes       FindingStatusType[]
  reportStatusTypes        ReportStatusType[]
  signatoryTypeOptions     SignatoryTypeOption[]
  signerRoleOptions        SignerRoleOption[]
  passFailStatusTypes      PassFailStatusType[]
  resolutionStatusTypes    ResolutionStatusType[]
  clientRequestTypeOptions ClientRequestTypeOption[]
  clientRequestStatusTypes ClientRequestStatusType[]
```

### 2.2 `User` — voeg toe aan het relatieblok

```prisma
  // Inspectiedomein (Fase 1)
  assignedInspectionPlans   InspectionPlan[]   @relation("InspectionPlanAssignee")
  reviewingInspectionPlans  InspectionPlan[]   @relation("InspectionPlanReviewer")
  createdInspectionPlans    InspectionPlan[]   @relation("InspectionPlanCreatedBy")
  modifiedInspectionPlans   InspectionPlan[]   @relation("InspectionPlanModifiedBy")
  createdAssets             Asset[]            @relation("AssetCreatedBy")
  visualInspections         VisualInspection[] @relation("VisualInspectionInspector")
  measurementRecords        MeasurementRecord[] @relation("MeasurementRecordInspector")
  createdFindings           Finding[]          @relation("FindingCreatedBy")
  resolvedFindings          Finding[]          @relation("FindingResolvedBy")
  uploadedInspectionPhotos  Photo[]            @relation("PhotoUploadedBy")
  inspectionSignatures      Signature[]        @relation("SignatoryUser")
  approvedReports           Report[]           @relation("ReportApprovedBy")
  createdReports            Report[]           @relation("ReportCreatedBy")
  createdInspectionLocations InspectionLocation[] @relation("InspectionLocationCreatedBy")
  syncQueueItems            SyncQueue[]        @relation("SyncQueueUser")
  resolvedSyncItems         SyncQueue[]        @relation("SyncResolvedBy")
  deviceRegistrations       DeviceRegistration[]
  inspectionMessages        InspectionMessage[] @relation("MessageUser")
  voiceUserPrompts          VoiceUserPrompt[]  @relation("VoiceUserPromptUser")
  uploadedInspectionDocx    DocumentTemplateDocxRevision[] @relation("InspectionDocxRevisionUploadedBy")
```

### 2.3 `Contact` — voeg toe aan het relatieblok

```prisma
  // Inspectiedomein (Fase 1)
  inspectionPlans InspectionPlan[]
  clientAccess    ClientAccess[]
  clientRequests  ClientRequest[]
```

### 2.4 `ContactPerson` — voeg toe aan het relatieblok

```prisma
  // Inspectiedomein (Fase 1)
  installationResponsiblePlans InspectionPlan[] @relation("PlanInstallationResponsible")
  inspectionSignatures         Signature[]      @relation("SignatoryContactPerson")
```

### 2.5 `Project` — voeg toe aan het relatieblok

```prisma
  // Inspectiedomein (Fase 1)
  inspectionPlans InspectionPlan[]
```

> Géén wijziging nodig op `Location` (Beheer-klantlocatie): App's inspectie-locatie is hernoemd naar `InspectionLocation`, dus er is geen botsing.

---

## 3. Enums vs per-org lookups — keuzes

De scheidslijn volgt precies wat Inspexi-App zelf in z'n migraties deed: status/type-**lijsten** werden daar al lookup-tabellen, lifecycle/structurele enums bleven enums. Wij nemen die lijn over, maar maken de lookups **per-org overschrijfbaar** (Beheer-stijl, nullable `orgId` + `isSystem`) i.p.v. App's globale-only lookups.

### 3a. Per-org overschrijfbare lookup-tabellen (11)

| Lookup-model | Tabel | Vervangt enum | Kolom op entiteit | Systeemcodes (orgId NULL) |
|---|---|---|---|---|
| `InspectionTypeOption` | `imp_inspection_types` | `InspectionType` | `InspectionPlan.inspectionTypeCode` | initial, periodic, modification, reinspection |
| `PlanStatusType` | `imp_plan_status_types` | `PlanStatus` | `InspectionPlan.statusCode` | draft, planned, in_progress, pending_review, reviewed, approved, completed, cancelled |
| `AssetStatusType` | `imp_asset_status_types` | `AssetStatus` | `Asset.statusCode` | new, in_progress, completed, rejected, not_applicable |
| `FindingStatusType` | `imp_finding_status_types` | `FindingStatus` | `Finding.statusCode` | open, acknowledged, resolved, disputed |
| `ReportStatusType` | `imp_report_status_types` | `ReportStatus` | `Report.statusCode` | draft, generating, generated, approved, sent, archived |
| `SignatoryTypeOption` | `imp_signatory_types` | `SignatoryType` | `Signature.signatoryTypeCode` | inspector, reviewer, client, installation_responsible |
| `SignerRoleOption` | `imp_signer_roles` | `SignerRole` | `DocumentSignature.signerRoleCode` | INSPECTOR, REVIEWER, CLIENT, INSTALLATION_RESPONSIBLE |
| `PassFailStatusType` | `imp_pass_fail_status_types` | `PassFailStatus` | `StandaloneMeasurementValue.passFailCode` | PASS, FAIL, WARNING, NOT_APPLICABLE |
| `ResolutionStatusType` | `imp_resolution_status_types` | `ResolutionStatus` | `FindingResolution.statusCode` | PENDING_VERIFICATION, VERIFIED, REJECTED |
| `ClientRequestTypeOption` | `imp_client_request_types` | `ClientRequestType` | `ClientRequest.requestTypeCode` | REINSPECTION, NEW_ASSIGNMENT, QUESTION, OTHER |
| `ClientRequestStatusType` | `imp_client_request_status_types` | `ClientRequestStatus` | `ClientRequest.statusCode` | PENDING_REQUEST, IN_PROGRESS_REQUEST, COMPLETED_REQUEST, CANCELLED_REQUEST |

**Resolutie-mechaniek (service-laag, géén harde Prisma-relatie):** de entiteit bewaart alleen de `code`-string. De `code` is niet globaal uniek (`@@unique([orgId, code])`), dus er is geen DB-FK. Resolveer met org-voorrang:

```sql
SELECT * FROM imp_plan_status_types
WHERE code = :code AND (org_id = :orgId OR org_id IS NULL)
ORDER BY org_id NULLS LAST   -- org-specifieke rij wint van globale default
LIMIT 1;
```

Maak hiervoor een gedeelde helper `resolveLookup(table, code, orgId)` + `listLookup(table, orgId)` (globale defaults + org-overrides gemerged op `code`). Een org kan: (a) een systeemcode **herlabelen**/kleur/volgorde/`isActive` aanpassen via een eigen rij met dezelfde `code`, of (b) **eigen extra codes** toevoegen.

> **Belangrijk:** vaste systeemcodes blijven leidend voor **state-machine-logica**. Backend-transities (`submit`→`pending_review`, `review`→`approved`, finalize/sign) vergelijken tegen de bekende systeemcodes; een org mag die codes herlabelen maar niet verwijderen. Documenteer de "beschermde" codes per lijst.

### 3b. Behouden als Prisma-enum (22)

Vaste, code-gebonden waarden die backend én PWA delen — niet org-uitbreidbaar:
`InspectionExecStatus`, `FindingInspectionType`, `PhotoEntityType`, `MeasurementDataType`, `SyncOperation`, `SyncStatus`, `ChecklistStatus`, `AssetFieldType`, `TemplateStatus`, `DocumentType`, `TemplateMode`, `SectionType`, `GeneratedDocumentStatus`, `SignatureStatus`, `MeasurementSheetTemplateStatus`, `MeasurementSheetFieldType`, `MeasurementSheetFieldWidth`, `PassFailOperator`, `MeasurementSheetRecordStatus`, `ClientUserStatus`, `ClientAccessRole`, `MarkerType`.

De template-lifecycle (`CONCEPT/ACTIEF/VERVALLEN`) en de meetstaat-veldtypes blijven bewust enums: publish/retire en de form-builder-logica zijn hard gecodeerd en niet per org te variëren.

### 3c. Hernoemd / niet overgenomen

- App `InspectionStatus` → **`InspectionExecStatus`** (verwarring met `PlanStatus` vermijden).
- App `ProjectStatus` / `AuditAction` — niet overgenomen (botsen met Beheer; App's `Project`/`AuditLog` vervallen).
- App `NormType` — vervangen door lookup `NormTypeDefinition` (**globaal**, geen `orgId`; normen zijn standaarden) + `normTypeCode String`.
- App `UserRole`, `UserStatus`, `ClientStatus`, `AddressType` — niet nodig (Beheer `Role`/`User`/`Contact` zijn leidend).

---

## 4. Rol-mapping (voor seed & auth, Fase 2)

| App `UserRole` | Beheer `Role` |
|---|---|
| `superadmin` | `SUPERUSER` |
| `administrator` | `ORG_ADMIN` |
| `werkvoorbereider` | `WERKVOORBEREIDER` |
| `inspecteur` | `INSPECTEUR` |

Alle 4 passen op bestaande Beheer-rollen; geen schema-wijziging aan de `Role`-enum nodig.

---

## 5. Seed — cleanup-volgorde (kinderen eerst)

Voeg aan de bestaande `deleteMany()`-keten in `apps/api/prisma/seed.ts` dit blok toe **vóór** het bestaande `auditLog → … → user → organization` deel (inspectiedata hangt aan org/user/contact):

```
// Client-portal
findingResolutionPhoto → findingResolution
messageAttachment → inspectionMessage
clientMagicLink → inspectionClientAccess → clientAccess → clientRequest → clientUser
// Sync & devices
syncQueue → deviceRegistration
// Documentgeneratie
documentSignature → generatedDocument
documentSection → documentTemplateDocxRevision → documentTemplate
// Meetstaten
measurementSheetRecord → measurementSheetVersionHistory → measurementSheetField → measurementSheetSection → measurementSheetTemplate
// Inspectie-templates
inspectionTemplateVersionHistory → inspectionTemplateMeasurementSheetLink → inspectionTemplateChecklistLink → inspectionTemplate
// Location images & standalone
locationImageMarker → standaloneMeasurementValue → standaloneMeasurement → locationImage
// Uitvoering
finding → measurementRecord → visualInspection → photo → signature → report → asset → inspectionLocation → inspectionPlan
// Checklists & categorieën
checklistVersionHistory → checklistItemLink → checklist → checklistItem → category
// Templates & types
finding... wait order: findingTemplate → reportTemplate → measurementFieldTemplate
assetTypeMeasurementConfig → assetTypeConstraint → assetTypeField → assetTypeDefinition
locationTypeConstraint → locationTypeField → locationTypeDefinition
// Norm & classificatie
normConfiguration → classificationOption → classificationCharacteristic → classificationModel → normTypeDefinition
// Voice
voiceUserPrompt → voiceTemplatePrompt → voiceBasePrompt
// Per-org lookups (relateren alleen aan Organization → vóór organization verwijderen)
inspectionTypeOption, planStatusType, assetStatusType, findingStatusType, reportStatusType,
signatoryTypeOption, signerRoleOption, passFailStatusType, resolutionStatusType,
clientRequestTypeOption, clientRequestStatusType
```

> Let op de richting: verwijder eerst de tabel die een FK *bezit*. `findingTemplate.classificationModelId` is required → `findingTemplate` vóór `classificationModel`. `measurementSheetField.autoFindingTemplateId` → meetstaat-velden vóór `findingTemplate`. Controleer de uiteindelijke volgorde met een dry-run seed.

**Seed-inhoud (minimaal voor Fase 1):**

- **Globale lookup-defaults** (`orgId = null`, `isSystem = true`) voor alle 11 lookup-tabellen met de systeemcodes uit §3a (Nederlandse labels + kleuren voor de status-badges). Dit is de basisset die elke org erft; geen org-rijen nodig in de seed.
- 6 systeem-`NormTypeDefinition` (NEN1010, NEN3140, SCOPE_8, SCOPE_10, IEC62446_1, SCOPE_12), 1–2 `ClassificationModel` met kenmerken/opties, een paar systeem-`AssetTypeDefinition`/`LocationTypeDefinition` met velden, één voorbeeld-`Checklist` + items, één `MeasurementSheetTemplate` + sectie/velden, één `InspectionTemplate`, en één demo-`InspectionPlan` (gekoppeld aan een bestaand seed-`Contact`) met assets + findings. Wachtwoorden blijven `Password123!`.

> Tip: definieer de 11 default-sets als één constantenbestand (`seed-lookups.ts`) en loop er met een `upsert` op `[orgId=null, code]` overheen — zo is de seed idempotent en makkelijk uit te breiden.

---

## 6. Audit-trail registratie

Beheer's automatische `$use`-middleware schrijft naar `imp_audit_logs`. Registreer de nieuwe modellen die je wilt auditen (config + kern-uitvoering; niet de sync/queue tabellen):

1. **`apps/api/src/prisma/prisma.service.ts`** — voeg toe aan `AUDITED_MODELS` (Set) + `MODEL_TABLE_MAP`:
   `InspectionPlan, Asset, Finding, InspectionLocation, Checklist, ChecklistItem, Category, FindingTemplate, ClassificationModel, NormTypeDefinition, AssetTypeDefinition, LocationTypeDefinition, InspectionTemplate, MeasurementSheetTemplate, MeasurementSheetRecord, GeneratedDocument, ClientRequest`.
2. **`apps/api/src/modules/audit-log/audit-log.service.ts`** — voeg FK-resolvers toe in `FK_FIELD_RESOLVERS` voor `contactId` (→ bedrijfsnaam), `assignedTo`/`reviewerId`/`createdBy` (→ User-naam), `inspectionTemplateId`, `classificationModelId`, `findingTemplateId`, enz. Voeg de modelnamen toe aan `ALLOWED_ENTITY_TYPES`.
3. **`apps/portal/src/lib/audit-field-labels.ts`** — NL veldlabels per entityType.
4. **`apps/portal/src/lib/audit-value-format.ts`** — enum-labels voor de nieuwe enums (PlanStatus, FindingStatus, etc.).

---

## 7. Migratie uitvoeren

```bash
# 1. Voeg de back-relations (§2) toe aan de bestaande modellen.
# 2. Plak inspection-domain.prisma achter het bestaande schema.
cat docs/fase1/inspection-domain.prisma >> apps/api/prisma/schema.prisma

# 3. Valideer + formatteer
cd apps/api
npx prisma format
npx prisma validate

# 4. Migratie (NOOIT db push) — vanuit apps/api/
npx prisma migrate dev --name add-inspection-domain

# 5. Seed bijwerken en draaien
pnpm db:seed

# 6. Volledige build/typecheck vanuit root
cd ../.. && npx turbo run build
```

---

## 8. Verificatie-checklist (onderdeel van Fase 1)

- [ ] `npx prisma validate` slaagt (alle back-relations aanwezig, geen dubbele relatienamen).
- [ ] `npx prisma format` geeft geen ongewenste diffs.
- [ ] Migratie draait schoon op een **lege** database (test de keten, niet alleen incrementeel) — `npx prisma migrate reset` op een wegwerp-DB.
- [ ] Seed draait zonder FK-fouten (cleanup-volgorde klopt).
- [ ] `npx turbo run build` is groen (Prisma-client genereert; geen TS-fouten in de portal-types).
- [ ] Steekproef: `InspectionPlan` → `Contact` join werkt; `Signature.signatoryContact` → `ContactPerson` werkt; `ClientAccess.contact` → `Contact` werkt.
- [ ] Geen tabel-naamcollisie: `imp_locations` (Beheer) en `imp_inspection_locations` (nieuw) bestaan naast elkaar.
- [ ] Lookups: 11 globale default-sets geseed (`orgId = null`); `resolveLookup('plan_status_types','draft',org)` geeft de juiste rij; een org-override (zelfde `code`, eigen label) wint van de globale default.
- [ ] State-machine: backend-transities vergelijken tegen systeemcodes (niet tegen labels) — een herlabelde org-status breekt de flow niet.

---

## 9. Bewuste afwijkingen / aandachtspunten

1. **`deletedAt` i.p.v. `isDeleted`** op het inspectiedomein (sync-tombstones). Documenteer in `CLAUDE.md` zodat services het juiste filter gebruiken.
2. **Gedenormaliseerde `orgId`** op uitvoeringstabellen — moet bij elke create consistent gezet worden (zet in de service-laag, niet door de PWA laten bepalen).
3. **`NormTypeDefinition` zonder harde relatie** — `normTypeCode` is een vrije string; valideer in de service tegen actieve normcodes.
3b. **Per-org lookups zonder harde FK** — de 11 status/type-lijsten worden via een `code`-string gekoppeld (geen DB-FK, want `code` is per-org uniek met globale fallback). Resolutie + validatie in de service (§3a). Voordeel: per-org override + globale defaults in één patroon; nadeel: geen DB-niveau integriteit op de code (bewust, conform App). Registreer de lookups als beheerbaar in de portal (org-admin: herlabelen/toevoegen; superuser: systeemdefaults).
4. **`MeasurementSheetTemplate` is globaal** (geen `orgId`, `@@unique([code, version])`) — alleen superuser beheert deze (zoals in App). Indien org-specifieke meetstaten later nodig zijn, wordt dit een schemawijziging.
5. **`GeneratedDocument.generatedBy`/`editedBy` en config-`createdBy`** zijn `@db.Uuid` zonder Prisma-relatie naar `User` (zoals in App) — bewust, om het aantal back-relations op `User` beperkt te houden. Resolve naar naam in de audit-/weergavelaag.
6. **Client-portal tenancy** (open punt 1 uit het hoofdplan) raakt nog niet het schema: `ClientUser` is org-agnostisch en bereikt orgs via `ClientAccess → Contact → orgId`. Definitief maken bij Fase 6.
