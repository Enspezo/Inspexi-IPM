# Schema-brief voor het testprogramma-seed

Geverifieerd tegen `apps/api/prisma/schema.prisma` (juli 2026). "Verplicht" = non-nullable zonder `@default`.
Twijfel je? Kijk in het schema — dit is een samenvatting, geen vervanging.

## Harde regels (niet overtreden)

1. **Nooit een ongefilterde `deleteMany()`.** De hoofdseed-data moet blijven staan. Ruim alleen eigen data op, gescoped op `orgId` of een `TP`-prefix.
2. **`AssetNode.path` bestaat NIET in de Prisma Client** (`Unsupported("ltree")`). **`depth` niet zetten** — DB-triggers vullen beide. Maak nodes **sequentieel aan, ouder vóór kind** (de trigger faalt met "Parent asset node % has no path" als de ouder ontbreekt).
3. **`AssetNode.nodeNumber` op `null` laten** — `backfillNumbering()` (draait aan het eind van de entry) kent nummers toe via de nummering-engine.
4. **`Finding.isCritical` is server-owned** maar er komt geen service langs in een seed: zelf zetten, consistent met `classificationValues` + `ClassificationOption.isCritical`.
5. **Quote-totalen zelf uitrekenen** (`QuoteLine.lineTotal`, `Quote.subtotal/discountTotal/vatTotal/total`) — normaal doet de service dat.
6. **`Quote.publicToken` heeft geen default** → zelf zetten waar je de publieke `/offerte/:token`-flow wilt testen.
7. **`InspectionPlan.referenceNumber` is NIET uniek in de DB.** Bewaak zelf dat `RAP-TEST-100` maar één keer bestaat, anders faalt de anonieme herstel-lookup.
8. **Globale (org-loze) modellen** raken álle orgs: `MeasurementSheetTemplate` (heeft geen `orgId`!), `NormTypeDefinition`, `ClassificationModel/Characteristic/Option`, `ClientUser`, en alle lookup-tabellen met `orgId = null`. Hergebruik wat de hoofdseed al neerzette in plaats van nieuwe systeemrijen te maken.
9. **`ClassificationOption.color` is NOT NULL zonder default** — altijd meegeven.
10. Slug-regex `^[a-z0-9]+$` zit alleen in de DTO's, niet in de DB. Houd je er toch aan.

## Bestaande, herbruikbare globale config (uit de hoofdseed)

| Model | Bestaande waarden |
|---|---|
| `ClassificationModel.code` | `NEN1010_DEFAULT` (kenmerk `SEVERITY`: opties `C1/C2/C3/FI`), `SCOPE8_DEFAULT` (kenmerk `CATEGORY`: `A/B/C`) |
| `NormTypeDefinition.code` | `NEN1010`, `NEN3140`, `SCOPE_8`, `SCOPE_10`, `IEC62446_1`, `SCOPE_12` |
| `AssetTypeDefinition.code` | `electrical_installation` (shortCode `EI`), `pv_installation` (`PV`) |
| `LocationTypeDefinition.code` | `distribution_room` (`VR`, scope INSPECTION) + 5 CRM-scope types (`woning/kantoor/industrieel/winkel/overig`) |
| `Checklist.code` | `CL-NEN1010` (versie 1.0, ACTIEF) met 2 items |
| `MeasurementSheetTemplate.code` | `MS-NEN1010-ISO` — sectie `isolation` (repeating), velden `group` (TEXT) en `r_iso` (NUMBER, unit MΩ, decimals 2, passFail GTE 1) |
| `InspectionTemplate.code` | `IT-NEN1010-INITIAL` |
| `DocumentTemplate` | 1× type `PLAN` gekoppeld aan `IT-NEN1010-INITIAL`, met 4 secties |
| Lookup-codes | planstatus `draft/planned/in_progress/pending_review/reviewed/approved/completed/cancelled`; assetstatus `new/in_progress/completed/rejected/not_applicable`; findingstatus `open/acknowledged/resolved/disputed`; signer-rollen `INSPECTOR/REVIEWER/CLIENT/INSTALLATION_RESPONSIBLE/HERSTELLER`; resolutiestatus `PENDING_VERIFICATION/VERIFIED/REJECTED/REPORTED/CONFLICT` |

Bestaande orgs: `inspexidemo` (plan Compleet + overrides AI_REVIEW/ONLINE_HERSTEL), `testbedrijf` (Basis), `inspexibasis` (Basis), `inspexicompleet` (Compleet), `inspeximix` (Basis + override WORKFLOW_COMPLEET).
Bestaande users: `admin|manager|backoffice|werkvoorbereider|inspecteur@inspexi-demo.nl`, `admin|inspecteur@testbedrijf.nl`, `superuser@inspexi.nl`. Wachtwoordhash: `bcrypt.hash('Password123!', 10)`.

## Modelvelden — beknopt

### Organisatie & gebruikers
- **Organization**: verplicht `name`, `slug`(uniek). Relevante velden: `defaultVat`(21), `defaultValidityDays`(30), `primaryColor?`, `isActive`(true), `planId?`, `quoteApprovalThreshold Decimal?(12,2)`, `quoteApprovalRequiredRole Role?`, `inspectionReviewEnabled`(**true**), `aiReviewEnabled`(false), `aiReviewInstructions?`, `onlineRepairDefault`(false), `chatEnabled`(true).
- **User**: verplicht `email`(uniek), `passwordHash`, `firstName`, `lastName`. `roles Role[]` (**array**), `orgId?`, `isActive`(true), `isDeleted`(false), `employmentType EmploymentType?` = `DIENSTVERBAND|FREELANCE`.
- `enum Role { SUPERUSER, ORG_ADMIN, MANAGER, BACKOFFICE, WERKVOORBEREIDER, INSPECTEUR }`
- **Invitation**: verplicht `orgId`, `email`, `role` (**enkelvoudig**, geen array), `expiresAt`. `token` heeft default uuid.
- **Plan/PlanFeature/OrganizationFeature**: `Plan` verplicht `name`,`slug`(uniek). `PlanFeature` verplicht `planId`,`featureKey`, uniek `[planId,featureKey]`. `OrganizationFeature` verplicht `orgId`,`featureKey`,`enabled`, uniek `[orgId,featureKey]`.
- Feature-keys: `BASIS_CRM, CRM_COMPLEET, BASIS_UITVOERING, UITVOERING_COMPLEET, BASIS_INSPECTIES, BASIS_WORKFLOW, WORKFLOW_COMPLEET, PROJECT_FASEN, WEBHOOKS, CUSTOM_FIELDS, AI_REVIEW, ONLINE_HERSTEL`.

### CRM
- **Contact**: verplicht `orgId`, `type` (`COMPANY|INDIVIDUAL`). Alles verder nullable: `companyName?`, `firstName?`, `lastName?`, `email?`, `phone?`, `vatNumber?`, `cocNumber?`, `notes?`, `ownerId?`, `isDeleted`(false). `priceTableId` is een losse kolom zonder FK — de echte koppeling is `ContactPriceTable` (`@@id([contactId, priceTableId])`).
- **ContactAddress**: verplicht `contactId`, `label`, `street`, `houseNumber`, `postalCode`, `city`. `country`("NL"), `isPrimary/isPostal/isInvoice`(false).
- **ContactPerson**: verplicht `contactId`, `orgId`, `firstName`, `lastName`.
- **Location**: verplicht `contactId`, `orgId`, `name`, `street`, `houseNumber`, `postalCode`, `city`. Optioneel `locationTypeId?` (CRM-scope type), `lat?`, `lng?`.
- **CustomerGroup**: verplicht `orgId`, `name`. **ContactCustomerGroup**: `@@id([contactId, customerGroupId])`.

### Producten & prijzen
- **Product**: verplicht `orgId`, `name`, **`unit`**. Btw-veld heet **`defaultVat Float`**(21). `productCode?` uniek per org. **Geen prijsveld op Product.**
- **PriceTable**: verplicht `orgId`, `name`. **PriceTableItem**: verplicht `priceTableId`, `productId`, `priceType` (`FIXED|TIERED`); `basePrice Decimal?(12,2)` (leeg bij TIERED). **PriceTier**: verplicht `priceTableItemId`, `fromQty Float`, `price Decimal(12,2)`; `toQty Float?`.

### Aanvragen & offertes
- **Request**: verplicht `orgId`, `contactId`, `source`, `title`, `createdBy`. `status @default(NIEUW)`. Redenvelden: `lostReasonId?` (FK LostReason) + `lostNote?`.
- `enum RequestSource { MANUAL, WEB_FORM, EMAIL, PHONE }` · `enum RequestStatus { NIEUW, IN_BEHANDELING, OFFERTE_GEMAAKT, GEWONNEN, VERLOREN, ON_HOLD }`
- **RequestStatusHistory**: verplicht `requestId`, `toStatus`, `changedBy`.
- **Quote**: verplicht `orgId`, `quoteNumber`, `contactId`, `subject`, `createdBy`. Uniek `[orgId, quoteNumber]` + `publicToken?` globaal uniek. Bedragen `Decimal(12,2) @default(0)`: `subtotal`, `discountTotal`, `vatTotal`, `total`. Verder `status @default(CONCEPT)`, `validUntil?`, `sentAt?`, `viewedAt?`, `signedAt?`, `requestId?`.
- `enum QuoteStatus { CONCEPT, TER_GOEDKEURING, GOEDGEKEURD, VERSTUURD, BEKEKEN, GEACCEPTEERD, AFGEWEZEN, VERLOPEN }`
- **QuoteLine**: verplicht `quoteId`, `description`, `quantity Float`, `unit String`, `unitPrice Decimal(12,2)`, `lineTotal Decimal(12,2)`. `vatRate Float`(21), `discountPct Float`(0), `sortOrder`(0). **Geen min/max in DB.**
- **QuoteApprovalRequest**: verplicht `quoteId`, `requestedBy`. `status ApprovalStatus @default(PENDING)` (`PENDING|APPROVED|REJECTED|CANCELLED`), `kind ApprovalKind @default(THRESHOLD)` (`THRESHOLD|VOLUNTARY_TEAM|VOLUNTARY_PERSON`), `approverRole Role?`, `approverUserId?`.

### Projecten, planning, beschikbaarheid
- **Project**: verplicht `orgId`, `projectNumber` (uniek per org), `title`, `contactId`, `projectManagerId`, `createdBy`. `status ProjectStatus @default(ACTIEF)` (`ACTIEF|ON_HOLD|AFGEROND|GEANNULEERD`).
- **PlanningItem**: verplicht `orgId`, `contactId`, `productName`, `createdBy`. `status PlanningStatus @default(NOG_TE_PLANNEN)` (`NOG_TE_PLANNEN|CONCEPT|GEPLAND|AFGEROND|VERVALLEN`), `publicToken` default uuid, `scheduledDate?`, `durationHours?`, `isMultiDay`(false), `sessionCount Int?` (DTO-grens 2..30, DB kent geen grens).
- **PlanningSession**: verplicht `planningItemId`, `sessionNumber Int`. `status SessionStatus @default(NOG_TE_PLANNEN)` (`NOG_TE_PLANNEN|CONCEPT|DEFINITIEF|AFGEROND|VERVALLEN`).
- **PlanningInspector**: verplicht `planningItemId`, `userId`; uniek samen. `acceptanceStatus @default(PENDING)` (`PENDING|ACCEPTED|REJECTED`).
- **PlanningHistory**: verplicht `planningItemId`, `action String`, `description String`.
- **AvailabilityTemplate**: verplicht `orgId`, `name`; **uniek `[orgId, name]`**. **AvailabilityTemplateSlot**: verplicht `templateId`, `weekday Int` (ISO 1=ma..7=zo), `startMinute Int`, `endMinute Int` (minuten sinds middernacht; 480=08:00).
- **UserScheduleAssignment**: verplicht `orgId`, `userId`, `templateId`, `validFrom @db.Date`, `createdById`.
- **AvailabilityException**: verplicht `orgId`, `userId`, `type` (`BESCHIKBAAR|GEBLOKKEERD`), `createdById`. Eenmalig: `startsAt?`,`endsAt?`,`allDay`(false) — gebruik expliciete `Z`-tijden. Herhalend: `isRecurring`, `weekdays Int[]`, `startMinute?`, `endMinute?`, `intervalWeeks`(1), `recurStartDate? @db.Date`, `recurEndDate? @db.Date`.

### Inspectiedomein
- **AssetNode**: verplicht `orgId`, `nodeType` (`LOCATION|ASSET`), `typeCode`, `name`. `parentId?`, `rootLocationId?` (uniek, alleen op de wortel, → CRM-Location), `identifier?`, `statusCode`("new"), `sortOrder`(0), `technicalData Json`({}), `createdBy?`. **`nodeNumber` null laten; `path`/`depth` niet zetten.**
- **InspectionPlan**: verplicht `orgId`, `contactId`, `projectName`, `normTypeCode`. `statusCode @default("draft")`, `inspectionTypeCode @default("initial")`, `locationId?`, `referenceNumber?` (**niet uniek in DB**), `addressStreet/HouseNumber/PostalCode/City?`, `plannedDate? @db.Date`, `assignedTo?`, `reviewerId?`, `submittedAt/reviewedAt/approvedAt/completedAt?`, `onlineRepairEnabled`(false), `criticalRepairNotifiedAt?`.
- **InspectionPlanLocation**: verplicht `orgId`, `inspectionPlanId`, `assetNodeId` (LOCATION-node); `isPrimary`(false); uniek `[inspectionPlanId, assetNodeId]`; **FK naar AssetNode = RESTRICT**.
- **Finding**: verplicht `orgId`, `assetNodeId`, `inspectionPlanId`, `inspectionType` (`visual|measurement`), `shortDescription`. `statusCode @default("open")`, `isCritical`(false), `classificationValues Json`({}), `longDescription?`, `recommendation?`, `normReference?`, `createdBy?`.
- **VisualInspection**: verplicht `orgId`, `assetNodeId`, `inspectionPlanId`. `status InspectionExecStatus @default(not_started)` (`not_started|in_progress|completed`), `checklistResults Json`([]), `inspectorId?`. **Geen `createdBy`-kolom.**
- **MeasurementRecord**: verplicht `orgId`, `assetNodeId`, `inspectionPlanId`. `measurements Json`([]).
- **MeasurementSheetRecord**: verplicht `orgId`, `templateId`, `assetNodeId`, `inspectionPlanId`, `templateVersion`, `templateSnapshot Json`, `createdBy`. `status @default(IN_PROGRESS)` (`IN_PROGRESS|COMPLETED|VALIDATED`), `data Json`({}) met vorm `{ isolation: { "0": { r_iso: { value, passFail } } } }` (rij-index als string-key), `finalCheckExecuted`, `finalCheckPassed?`, `finalCheckResults?`.
- **Checklist**: verplicht `name`, `normTypeCode`, `createdBy`. `orgId?`, `code?`, `version`("1.0"), `status ChecklistStatus @default(CONCEPT)` (`CONCEPT|ACTIEF|VERVALLEN`), `previousVersionId?`; uniek `[orgId, code, version]`. **ChecklistItem**: verplicht `question`, `createdBy`. **ChecklistItemLink**: verplicht `checklistId`, `checklistItemId`, uniek samen.
- **MeasurementSheetTemplate** (globaal, géén orgId): verplicht `code`, `name`, `normTypeCode`, `createdBy`; uniek `[code, version]`; `status @default(CONCEPT)`. **Section**: verplicht `templateId`,`code`,`name`; uniek `[templateId,code]`; `isRepeating`, `minRows`. **Field**: verplicht `sectionId`,`code`,`name`,`fieldType` (`NUMBER|TEXT|TEXTAREA|CHECKBOX|DROPDOWN|CALCULATED|PHOTO`); `unit?`, `decimals?`, `minValue/maxValue Decimal?(18,6)`, `passFailEnabled`, `passFailOperator?` (`GTE|GT|LTE|LT|EQ|RANGE|IN`), `passFailValue?`.
- **LocationImage**: verplicht `orgId`, `nodeId`(uniek, LOCATION-node), `storagePath`. **LocationImageMarker**: verplicht `orgId`, `locationImageId`, `positionX/Y Float` (percentage 0-100), `markerType` (`ASSET|MEASUREMENT|FINDING`).
- **StandaloneMeasurement**: verplicht `orgId`, `inspectionPlanId`, `locationNodeId` (**RESTRICT**), `measurementType`.

### Documenten
- **GeneratedDocument**: verplicht `orgId`, `inspectionPlanId`, `documentType` (`PLAN|REPORT|HERSTELVERKLARING`), `htmlContent`. **`documentTemplateId?` en `generatedBy?` zijn nullable.** `status GeneratedDocumentStatus @default(DRAFT)` = `DRAFT|PENDING_SIGNATURES|SIGNED|FINALIZED`.
- **DocumentSignature**: verplicht `generatedDocumentId`, `signerRoleCode` (`INSPECTOR|REVIEWER|CLIENT|INSTALLATION_RESPONSIBLE|HERSTELLER`). `status SignatureStatus @default(PENDING)` = `PENDING|REQUESTED|SIGNED|DECLINED|EXPIRED`.
  **Er is geen apart signature-request-model**: een openstaand verzoek = een rij met `status: 'REQUESTED'` + `signatureRequestId` (losse string, geen FK) + `signatureRequestSentAt` + `signatureRequestUrl` = `${PUBLIC_URL}/sign/${requestId}`. De publieke pagina zoekt op `signatureRequestId`.

### Client-realm & online herstel
- **ClientUser** (org-agnostisch): verplicht `email`(uniek), `firstName`, `lastName`. `passwordHash?`, `status ClientUserStatus @default(ACTIVE)` (`PENDING|ACTIVE|INACTIVE`), `emailVerified`(false).
- **ClientAccess**: verplicht `clientUserId`, `contactId`; uniek samen; `role ClientAccessRole @default(VIEWER)` (`VIEWER|SIGNER|ADMIN`) — **dit bepaalt de org-scope van de klant**.
- **ClientMagicLink**: verplicht `email`, `token`(uniek), `expiresAt`. `clientUserId?`, `inspectionPlanId?`, `usedAt?` (vul dit voor een "al gebruikte link"-testgeval).
- **InspectionClientAccess**: verplicht `inspectionPlanId`, `invitedBy`. `clientUserId?`, `canView`(true), `canSign`(false); uniek `[inspectionPlanId, clientUserId]`.
- **ClientRequest**: verplicht `orgId`, `contactId`, `clientUserId`, `requestTypeCode`, `subject`, `description`. Types `REINSPECTION|NEW_ASSIGNMENT|QUESTION|OTHER`; statussen `PENDING_REQUEST|IN_PROGRESS_REQUEST|COMPLETED_REQUEST|CANCELLED_REQUEST`.
- **RepairSession**: verplicht `orgId`, `inspectionPlanId`, `accessType` (`CLIENT_USER|ANONYMOUS`), `token`(uniek), `expiresAt`. `status @default(ACTIVE)` (`ACTIVE|COMPLETED|EXPIRED`), `generatedDocumentId?`, `completedAt?`.
- **FindingResolution**: verplicht `findingId`. `repairSessionId?`, `resolvedByClientUserId?` (**nullable** voor anoniem), `description?`, `statusCode @default("PENDING_VERIFICATION")`; uniek `[findingId, repairSessionId]`. **FindingResolutionPhoto**: verplicht `resolutionId`, `photoUrl`.

### Notificaties
- **Notification**: verplicht `userId`, `type NotificationType`, `title`, `body`. `orgId?`, `entityType?`, `entityId?`, `isRead`(false).
