# IMP_PRD_14 — Online herstel van constateringen (externen & klanten)

*Status: concept — 16 juli 2026*
*Bijbehorend uitvoeringsdoc: `docs/IMP_PRD_14_APPLY-WITH-CLAUDE-CODE.md`*

## 14.0 TL;DR / Kernbeslissingen

- **Externen** (installateurs) en **ingelogde klanten** kunnen per constatering online herstel melden: korte omschrijving van de uitgevoerde werkzaamheden + **minimaal 1 foto**, afsluiten met een **digitaal ondertekende herstelverklaring** over de eigen herstelde constateringen.
- **Dubbele poort + per-inspectie-schakelaar**: add-on-entitlement **`ONLINE_HERSTEL`** (SUPERUSER kent toe) → org-instelling **`onlineRepairDefault`** ("standaard aan/uit" voor nieuwe inspecties) → per-inspectie vlag **`InspectionPlan.onlineRepairEnabled`** (staf kan per plan aan/uit zetten).
- **Anonieme toegang** via het klantportaal op het org-subdomein (`{slug}.…:5174/herstel`) met **rapportnummer + postcode**. Rapportnummer = het bestaande `InspectionPlan.referenceNumber` (besluit); activering per inspectie vereist daarom een gevuld en binnen de org uniek referenceNumber. Later QR-code-toegang — het sessiemodel is daarop voorbereid.
- **Herstelmelding telt direct als opgelost**: de claim flipt `Finding.statusCode` → `resolved` **atomisch (first-wins)**. De "administratieve herinspectie" door de inspecteur is de formele controle achteraf.
- **Conflictafhandeling**: de verliezer van een race krijgt een 409-melding, kan de constatering niet meer selecteren bij het afronden, maar zijn invoer wordt bewaard als `FindingResolution` met status `CONFLICT`; PM + opdrachtgever ontvangen een conflictmelding met de verschillen.
- **Herstelverklaring** = `GeneratedDocument` met nieuw `DocumentType.HERSTELVERKLARING`, ondertekend via de bestaande `DocumentSignature`-flow (canvas, nieuw signer-role `HERSTELLER`), PDF via de bestaande Puppeteer-service. Bevestiging per e-mail naar de invuller én de opdrachtgever; notificatie naar de projectmanager.
- **"Kritiek" wordt configureerbaar**: nieuw `ClassificationOption.isCritical` + gedenormaliseerd `Finding.isCritical`. Zodra er géén kritieke constateringen meer open staan → eenmalige melding/e-mail naar PM + opdrachtgever met de vraag of een **administratieve herinspectie** ingepland moet worden.
- **Privacy**: anonieme sessies zien géén contactgegevens van de opdrachtgever — wel adresgegevens, inspectiedatum en inspecteur-contact volgens de bestaande `ContactDisplayMode`-instellingen. Herstelde constateringen tonen werkzaamheden + foto's, maar **nooit wie** ze heeft hersteld (staf ziet dat wél).
- **Maximaal hergebruik**: `FindingResolution` + `FindingResolutionPhoto`, de `client-*`-modulefamilie, entitlements (PRD-09), `NotificationsService.dispatch`, Resend `EmailService`, `resolveInspectorContact`, `SignatureCanvas` en de document-generatie/ondertekening-stack.

## 14.1 Doel

Na een inspectie moeten constateringen hersteld worden — vaak door verschillende externe partijen (installateur, dakdekker, klant zelf) die elk een deel oppakken. Nu verloopt terugmelding per e-mail/telefoon en moet de backoffice alles handmatig verwerken. Online herstel laat elke hersteller zélf per constatering melden wat er gedaan is (met bewijsfoto's), sluit dat af met een ondertekende herstelverklaring, en signaleert automatisch wanneer alle kritieke punten hersteld zijn zodat een administratieve herinspectie ingepland kan worden. Organisaties bepalen zelf (per abonnement, per org-default en per inspectie) of dit beschikbaar is.

## 14.2 Kernconcepten & terminologie

| Term | Betekenis |
|---|---|
| Online herstel | De functie als geheel: externen/klanten melden herstel van constateringen via het klantportaal. |
| Herstelsessie (`RepairSession`) | Eén toegangssessie tot de herstel-flow van één inspectieplan: anoniem (rapportnummer+postcode) of gekoppeld aan een ingelogde `ClientUser`. Draagt het sessietoken, de invullergegevens en de uiteindelijke herstelverklaring. |
| Herstelmelding / claim | Het per constatering melden "deze heb ik hersteld" (werkzaamheden + foto's). De claim is het first-wins-moment: de finding gaat atomisch naar `resolved`. |
| Herstelverklaring | Ondertekend document (`GeneratedDocument`, type `HERSTELVERKLARING`) met de genummerde constateringen waarvoor de invuller verklaart dat ze hersteld zijn. Meerdere verklaringen per plan mogelijk (één per afgeronde sessie). |
| Kritieke constatering | Finding waarvan de classificatie-optie als kritiek is gemarkeerd (`ClassificationOption.isCritical`), gedenormaliseerd naar `Finding.isCritical`. |
| Administratieve herinspectie | Herbeoordeling op afstand door de inspecteur o.b.v. de herstelmeldingen — dit PRD levert alleen de trigger (melding/e-mail), niet het inplannen zelf. |
| Conflict | Tweede herstelmelding op een al geclaimde constatering: bewaard als concept (`CONFLICT`), niet doorgevoerd, wel gemeld aan PM + opdrachtgever. |
| Projectmanager (PM) | `Project.projectManagerId` als het plan aan een project hangt; anders `InspectionPlan.reviewerId`; anders `InspectionPlan.assignedTo`. |

## 14.3 Uitgangspunten & besluiten

1. **Rapportnummer = `referenceNumber`.** Geen nieuw nummerveld. Consequentie: `onlineRepairEnabled` kan alleen aan als `referenceNumber` gevuld is én uniek binnen de org (service-validatie bij het aanzetten, met NL-foutmelding). De anonieme lookup matcht case-insensitief en getrimd; de postcode wordt genormaliseerd (hoofdletters, spaties strippen) en gematcht tegen `InspectionPlan.addressPostalCode` met fallback `Location.postalCode`.
2. **Melding = opgelost.** Een succesvolle claim zet `Finding.statusCode` → systeemcode `resolved` + `resolvedAt` (zelfde semantiek als de staf-flow in `findings.service.ts`). Er is géén staf-verificatiestap vooraf; de administratieve herinspectie is de controle. De bestaande client-portal-flow met `PENDING_VERIFICATION` blijft bestaan voor orgs zónder de add-on (zie §14.9.6).
3. **First-wins, atomisch.** De claim gebeurt via een `updateMany({ where: { id, orgId, statusCode: 'open' } })` binnen een transactie. Nul geraakte rijen = verloren race → invoer bewaren als `CONFLICT`-resolution + 409 richting de client. "Nog niet afgerond" beschermt niet: wie het eerst claimt wint, ook als diens verklaring nog niet ondertekend is.
4. **Anonimiteit richting externen.** In de herstel-weergave (en het klantportaal) is bij een herstelde constatering zichtbaar: werkzaamheden-omschrijving + foto's + datum. Nooit: naam/bedrijf/e-mail van de hersteller. Staf ziet die gegevens wél (traceerbaarheid).
5. **Meerdere partijen per plan.** Elke partij werkt in een eigen sessie en rondt alleen de eigen claims af. Afronden is optioneel per sessie; niet-afgeronde claims blijven gewoon opgelost.
6. **Dubbele poort + plan-vlag.** Entitlement `ONLINE_HERSTEL` (mag) → `Organization.onlineRepairDefault` (default voor nieuwe plannen) → `InspectionPlan.onlineRepairEnabled` (geldt). Het wijzigen van de org-default heeft géén effect op bestaande plannen (voorspelbaar gedrag).
7. **PM-resolutie met fallback.** `Project.projectManagerId` → `reviewerId` → `assignedTo`. Eén helper `resolveProjectManager(plan)` in de repair-service, met unit tests.
8. **Kritiek is configuratie, geen code.** `ClassificationOption.isCritical` (beheer op het bestaande SUPERUSER-classificatiescherm) + gedenormaliseerd `Finding.isCritical`, onderhouden in `findings.service` én de `/sync`-push-mapper (PWA-findings!) + eenmalig backfill-script. De bestaande hardcoded rendering (SCIOS 1 / NEN A) blijft onaangetast.
9. **Herinspectie-trigger is eenmalig.** Na elke succesvolle claim: als het plan geen open kritieke findings meer heeft én `criticalRepairNotifiedAt` leeg is → timestamp zetten + notificatie/e-mail. Heropent staf een kritieke finding, dan wordt het veld weer leeggemaakt zodat de trigger opnieuw kan vuren.
10. **Taal.** Alle UI-teksten, e-mails, documentteksten en foutmeldingen in het **Nederlands**; code/commits Engels.
11. **Geen enumeratie-lek.** De anonieme lookup geeft altijd dezelfde generieke fout ("Deze combinatie is niet gevonden of online herstel is niet beschikbaar voor deze inspectie") — ongeacht of het nummer bestaat, de postcode fout is of de functie uit staat. Throttling 5/min per IP.

## 14.4 Configuratie & entitlement

### 14.4.1 Entitlement

Nieuw add-on-key in `packages/entitlements/src/feature-catalog.ts` (patroon `WEBHOOKS`):

```ts
ONLINE_HERSTEL: {
  key: 'ONLINE_HERSTEL',
  label: 'Online herstel (add-on)',
  description: 'Externen en klanten melden herstel van constateringen online, incl. ondertekende herstelverklaring',
  dependsOn: ['BASIS_INSPECTIES'],
},
```

Alle repair-endpoints krijgen `@RequiresFeature('ONLINE_HERSTEL')`. `ONLINE_HERSTEL` verschijnt automatisch in de bestaande SUPERUSER-entitlements-tab.

### 14.4.2 Nieuwe velden

```prisma
// Organization
onlineRepairDefault Boolean @default(false) @map("online_repair_default")

// InspectionPlan
onlineRepairEnabled      Boolean   @default(false) @map("online_repair_enabled")
criticalRepairNotifiedAt DateTime? @map("critical_repair_notified_at")
```

- `onlineRepairEnabled` wordt bij `InspectionPlansService.create()` gezet vanuit de org-default (alleen als het entitlement actief is). Staf kan het per plan togglen; **aanzetten valideert het referenceNumber** (gevuld + uniek binnen org, anders `BadRequestException` met uitleg).
- `UpdateOrganizationDto` + org-settings-UI uitbreiden (zoals `chatEnabled`); `onlineRepairEnabled` via de bestaande plan-update-DTO.

## 14.5 Datamodel (Prisma)

Eén nieuw model + uitbreidingen (tabellen `imp_`-prefix; migratie vanuit `apps/api/`, nooit `db push`).

```prisma
enum RepairAccessType {
  CLIENT_USER  // ingelogde klantportaal-gebruiker
  ANONYMOUS    // rapportnummer + postcode (later: QR)
}

enum RepairSessionStatus {
  ACTIVE
  COMPLETED   // herstelverklaring ondertekend
  EXPIRED
}

model RepairSession {
  id                  String              @id @default(uuid()) @db.Uuid
  orgId               String              @map("org_id") @db.Uuid
  inspectionPlanId    String              @map("inspection_plan_id") @db.Uuid
  accessType          RepairAccessType
  status              RepairSessionStatus @default(ACTIVE)
  token               String              @unique // crypto-random, zoals ClientMagicLink
  clientUserId        String?             @map("client_user_id") @db.Uuid
  // Invullergegevens (verklaring); bij CLIENT_USER vooraf gevuld vanuit het account
  contactName         String?             @map("contact_name")
  companyName         String?             @map("company_name")
  email               String?             // verplicht bij ANONYMOUS vóór afronden
  generatedDocumentId String?             @map("generated_document_id") @db.Uuid // herstelverklaring
  expiresAt           DateTime            @map("expires_at") // now + 72 uur
  completedAt         DateTime?           @map("completed_at")
  lastActivityAt      DateTime            @default(now()) @map("last_activity_at")
  createdIpAddress    String?             @map("created_ip_address")
  createdAt           DateTime            @default(now()) @map("created_at")

  organization      Organization       @relation(fields: [orgId], references: [id], onDelete: Cascade)
  inspectionPlan    InspectionPlan     @relation(fields: [inspectionPlanId], references: [id], onDelete: Cascade)
  clientUser        ClientUser?        @relation(fields: [clientUserId], references: [id], onDelete: SetNull)
  generatedDocument GeneratedDocument? @relation(fields: [generatedDocumentId], references: [id], onDelete: SetNull)
  resolutions       FindingResolution[]

  @@index([orgId, inspectionPlanId])
  @@map("imp_repair_sessions")
}
```

Uitbreidingen op bestaande modellen/lookups:

- **`FindingResolution`**: nieuw veld `repairSessionId String? @map("repair_session_id") @db.Uuid` (FK → `RepairSession`, `onDelete: SetNull`) + relatie. Bestaande velden (`description`, `statusCode`, foto's) worden hergebruikt.
- **`ResolutionStatusType`**: twee nieuwe system-rows (seed, `isSystem: true`): `REPORTED` ("Hersteld gemeld") en `CONFLICT` ("Conflict — niet doorgevoerd"). Bestaand `PENDING_VERIFICATION` blijft.
- **`ClassificationOption`**: `isCritical Boolean @default(false) @map("is_critical")`.
- **`Finding`**: `isCritical Boolean @default(false) @map("is_critical")` — gedenormaliseerd, gezet door de service (§14.3 besluit 8), met index `@@index([inspectionPlanId, isCritical, statusCode])` voor de kritiek-check.
- **`DocumentType`**: nieuw enum-value `HERSTELVERKLARING` (naast `PLAN`/`REPORT`).
- **`SignerRoleOption`**: nieuwe system-row `HERSTELLER` ("Hersteller").
- **`NotificationType`**: `HERSTEL_AFGEROND`, `HERSTEL_CONFLICT`, `HERINSPECTIE_VOORSTEL` (enum-migratie in fase 3).

Aandachtspunten:

- **Seed-opruimvolgorde** (kinderen eerst): `findingResolutionPhoto → findingResolution → repairSession` — repairSession vóór `generatedDocument`, `clientUser` en `inspectionPlan`. Bestaande volgorde verder ongemoeid.
- **Audit trail**: `RepairSession` en `FindingResolution` toevoegen aan `AUDITED_ENTITIES` (afgeleide registries volgen automatisch). Let op (bijgesteld na review PR #128, punt 13): de bestaande audit-middleware slaat mutaties zónder staf-`userId` volledig over (`AuditLog.userId` is NOT NULL) — client-/anonieme herstel-mutaties worden dus **niet** geaudit; alleen staf-handelingen op deze modellen. Traceerbaarheid van anonieme flows zit in de records zelf (`RepairSession.createdIpAddress`, `FindingResolution.repairSessionId` + sessie-invullergegevens). Besluit: de audit-kern (`userId` nullable) wordt niet aangepast binnen deze scope.
- Portal-types (`apps/portal/src/types/index.ts`) en client-portal-types aanvullen.

## 14.6 API-ontwerp — module `client-repair`

Nieuwe module `apps/api/src/modules/client-repair/` naast de bestaande `client-*`-modules. **Eén sessiemodel voor beide toegangsvormen**: ook een ingelogde `ClientUser` start een `RepairSession`; daarna lopen alle herstel-endpoints via het sessietoken (`Authorization: Bearer <token>` op een eigen `RepairSessionGuard` — valideert token, `status = ACTIVE`, `expiresAt`, org-match via subdomein, en update `lastActivityAt`). Response-format `{ success, data }`.

| Route | Methode | Auth | Doel |
|---|---|---|---|
| `/client/repair/lookup` | POST | `@Public()` + `@Throttle` 5/60s | `{ referenceNumber, postalCode }` → ANONYMOUS-sessie + token + plan-samenvatting. Generieke fout bij elke mislukking (§14.3 besluit 11). |
| `/client/repair/sessions` | POST | `ClientJwtAuthGuard` | `{ inspectionPlanId }` → CLIENT_USER-sessie (via bestaande `assertInspectionAccess`), invullergegevens vooraf gevuld. |
| `/client/repair/session` | GET | `RepairSessionGuard` | Plan-info (adres, inspectiedatum, inspecteur-contact via `resolveInspectorContact`), samenvatting per classificatie-groep (open/opgelost, kritiek gemarkeerd), constateringenlijst incl. foto's en herstel-info (zonder wie). |
| `/client/repair/findings/:id/resolve` | POST | `RepairSessionGuard` | Claim: `{ description }` (verplicht). Transactie: atomische claim → `FindingResolution` (`REPORTED`) of verloren race → `CONFLICT`-resolution + conflictdispatch + `409` met NL-melding. |
| `/client/repair/findings/:id/resolve/photos` | POST | `RepairSessionGuard` | Multipart, max 5, jpg/png ≤5MB (identiek aan `client-findings`), alleen op eigen `REPORTED`/`CONFLICT`-resolutions van deze sessie. |
| `/client/repair/photos/:id` | GET | `RepairSessionGuard` | Foto-stream (finding- én resolutiefoto's binnen het plan van de sessie). |
| `/client/repair/complete` | POST | `RepairSessionGuard` | `{ resolutionIds, contactName, companyName?, email? }` → valideert: alle ids van eigen sessie met status `REPORTED`, **≥1 foto per resolution**, e-mail verplicht bij ANONYMOUS. Genereert herstelverklaring (concept) → `{ documentId, htmlPreview }`. |
| `/client/repair/sign` | POST | `RepairSessionGuard` | `{ signatureImage }` → `DocumentSignature` (rol `HERSTELLER`) SIGNED, PDF-render, e-mails + notificaties (§14.8), sessie → COMPLETED. |

Alle routes `@RequiresFeature('ONLINE_HERSTEL')`; org uit het subdomein (`@CurrentTenant`). Sessietoken: 48 bytes crypto-random, plain opgeslagen met `@unique` (zelfde afweging als `ClientMagicLink`), TTL 72 uur.

**Claim-transactie (kern van de concurrency):**

```
$transaction:
  1. updateMany Finding { id, orgId, inspectionPlanId: sessie.plan, statusCode: 'open', deletedAt: null }
       → { statusCode: 'resolved', resolvedAt: now }
  2a. count === 1 → create FindingResolution { statusCode: 'REPORTED', repairSessionId, description }
  2b. count === 0 → create FindingResolution { statusCode: 'CONFLICT', repairSessionId, description }
      → na commit: fire-and-forget conflictdispatch (§14.8) → throw ConflictException('Deze constatering is zojuist al door een andere partij hersteld gemeld. Uw invoer is bewaard en de projectmanager is geïnformeerd.')
```

**Kritiek-check** (na elke succesvolle claim, fire-and-forget): `count Finding { inspectionPlanId, isCritical: true, statusCode: 'open', deletedAt: null }` — bij 0 én `criticalRepairNotifiedAt = null` → timestamp zetten (atomisch via `updateMany … where criticalRepairNotifiedAt: null` tegen dubbele triggers) + `HERINSPECTIE_VOORSTEL`-dispatch + e-mail opdrachtgever. In `findings.service.ts`: wanneer staf een finding met `isCritical` heropent → `criticalRepairNotifiedAt` leegmaken.

Wijzigingen aan bestaande modules:

- **`findings.service.ts`**: `isCritical` berekenen bij create/update (o.b.v. `classificationValues` × `ClassificationOption.isCritical` van het classificatiemodel van het plan/template); heropen-reset van `criticalRepairNotifiedAt`.
- **`sync`-mapper (v3)**: zelfde `isCritical`-berekening bij de findings-push vanuit de PWA (server-side; de PWA stuurt niets extra's).
- **`inspection-plans.service.ts`**: `onlineRepairEnabled` default bij create; validatie bij aanzetten (referenceNumber gevuld + uniek); veld in de update-DTO.
- **`generated-documents`**: severity-key-detectie (`CLASSIFICATIE/RISICO/SEVERITY/PRIORITEIT`) verhuist naar een gedeelde helper in `common/` zodat de samenvatting-groepering (§14.6, GET session) dezelfde logica gebruikt.

## 14.7 Herstelverklaring (document)

- **Code-based HTML-template** (Handlebars, zoals de rapport-rendering) — géén org-configureerbare template in v1 (zie §14.13). Gegenereerd als `GeneratedDocument` (`documentType: HERSTELVERKLARING`, `inspectionPlanId` gezet) zodat het automatisch in de bestaande documentenlijsten van staf- én klantportaal verschijnt.
- **Inhoud**: org-branding/logo; rapportnummer, adres en inspectiedatum; invullergegevens (naam, bedrijf, e-mail); **genummerde lijst** van de geselecteerde constateringen — volgnummer = deterministische positie binnen het plan (sortering `createdAt asc, id asc`, dezelfde volgorde als de herstel-lijst) — met per constatering: korte omschrijving, locatie-omschrijving, normverwijzing, de gemelde werkzaamheden en de bewijsfoto's (verkleind raster); verklaringstekst ("Ondergetekende verklaart dat de bovengenoemde constateringen zijn hersteld zoals omschreven."); handtekening + datum + IP-adres.
- **Ondertekening**: `DocumentSignature` met `signerRoleCode: 'HERSTELLER'`, canvas-handtekening (`signatureImage`), daarna status `SIGNED` en PDF via `PdfGenerationService`. Meerdere verklaringen per plan zijn normaal (één per afgeronde sessie).

## 14.8 E-mails & notificaties

| Moment | Notificatie (in-app + e-mail volgens prefs) | Directe e-mail (Resend) |
|---|---|---|
| Verklaring ondertekend | `HERSTEL_AFGEROND` → PM | Bevestiging + verklaring-PDF naar invuller (sessie-e-mail of `clientUser.email`) én naar de opdrachtgever (`Contact.email` van `plan.contactId`; leeg → overslaan + `Logger.warn`). |
| Verloren race (claim-conflict) | `HERSTEL_CONFLICT` → PM | Conflictmelding naar opdrachtgever + PM: constatering, beide werkzaamheden-omschrijvingen en foto-aantallen naast elkaar. |
| Laatste kritieke constatering opgelost | `HERINSPECTIE_VOORSTEL` → PM ("Alle kritieke constateringen zijn hersteld gemeld — administratieve herinspectie inplannen?") | Zelfde vraag naar de opdrachtgever. |

Enum-migratie + `notifications.constants.ts` (groep `INSPECTIEPLANNEN`) + `apps/portal/src/lib/notifications.ts` (NL-labels, iconen, link `/inspections/:id`). PM-resolutie volgens §14.3 besluit 7. Alle dispatches fire-and-forget (bestaand patroon).

## 14.9 Client-portal UI (`apps/client-portal`)

### 14.9.1 Anonieme toegang — `/herstel`

Publieke route (buiten de auth-guard): formulier **rapportnummer + postcode** met org-branding, generieke foutmelding, na succes redirect naar het herstel-overzicht. Sessietoken in memory + `sessionStorage` (herstelbaar binnen de tab, niet cross-tab persistent).

### 14.9.2 Herstel-overzicht

- Kop: adres, inspectiedatum, inspecteur-contact (server levert dit al geresolved).
- **Samenvattingskaarten per classificatie-groep** (label + kleur van de `ClassificationOption`): aantal openstaand / aantal opgelost; kritieke groepen gemarkeerd.
- **Constateringenlijst** (volgnummers zoals in de verklaring): open → kaart met omschrijving, locatie, foto's en knop "Herstel melden"; hersteld → **grijs/gedimd** met werkzaamheden-omschrijving en foto's zichtbaar, zonder herstellergegevens; eigen claims uit deze sessie krijgen een badge "Door u gemeld".

### 14.9.3 Herstelmodal

Werkzaamheden-omschrijving (verplicht) + `PhotoUploader` (bestaand component) met **minimaal 1 foto** (client-side verplicht vóór versturen; server-side afgedwongen bij afronden). Bij een 409-conflict: duidelijke melding dat een andere partij eerder was, invoer is bewaard, constatering wordt direct grijs.

### 14.9.4 Afronden-wizard ("Afronden")

1. **Selectie**: eigen `REPORTED`-meldingen aanvinken (conflicten zichtbaar maar niet selecteerbaar, met uitleg); validatiehint bij meldingen zonder foto.
2. **Gegevens**: naam (verplicht), bedrijf (optioneel), e-mail (verplicht bij anoniem — daar gaat de bevestiging heen; bij ingelogde klant vooraf gevuld).
3. **Preview**: de herstelverklaring met de genummerde constateringen (htmlPreview van de server).
4. **Ondertekenen**: bestaande `SignatureCanvas` → bevestigingsscherm met downloadlink van de PDF.

### 14.9.5 Ingelogde klant

Op de inspectie-detailpagina een sectie/knop **"Online herstel"** (alleen zichtbaar bij `plan.onlineRepairEnabled` + feature) → start een CLIENT_USER-sessie en gebruikt exact dezelfde overzicht/modal/wizard-componenten.

### 14.9.6 Relatie met de bestaande "constatering oplossen"-flow

De bestaande `resolve-finding-modal` (→ `PENDING_VERIFICATION`) blijft ongewijzigd voor orgs **zonder** `ONLINE_HERSTEL`. Bij orgs **met** de add-on en `onlineRepairEnabled` op het plan verwijst de findings-tab naar de herstel-flow (één consistente route; geen twee parallelle meldkanalen op hetzelfde plan). Herstelde constateringen worden ook in de bestaande findings-tab grijs weergegeven.

## 14.10 Staf-portal UI (`apps/portal`)

- **Organisatie-instellingen**: toggle "Online herstel standaard aan voor nieuwe inspecties" (`onlineRepairDefault`) — disabled + hint "Niet beschikbaar in uw abonnement" zonder entitlement.
- **Inspectie-detail (Overzicht)**: toggle "Online herstel" per plan, met inline validatiemelding als het referenceNumber ontbreekt/niet uniek is; bij actief: weergave van rapportnummer + kopieerbare herstel-URL (`https://{slug}.{baseDomain}:5174/herstel`).
- **Assets/constateringen-weergave**: herstelde constateringen grijs met resolutie-info (werkzaamheden, foto's, bron "Online herstel", invullergegevens — staf mag dit zien); `CONFLICT`-records als uitklapbaar blok "Conflict — niet doorgevoerd" bij de constatering.
- **Documenten-tab**: herstelverklaringen verschijnen automatisch in de bestaande `GeneratedDocument`-lijst (type-label toevoegen).
- **Inspectie-systeem → classificatiemodellen** (SUPERUSER): checkbox "Kritiek" per `ClassificationOption`.

## 14.11 Beveiliging & privacy

- **Anti-enumeratie**: generieke lookup-fout + throttling (lookup 5/min; claim/complete/sign 20/min per IP). Mislukte lookups loggen (`Logger.warn` met IP) voor misbruikdetectie.
- **Scope van een sessie**: uitsluitend het ene inspectieplan; alle queries org- én plan-scoped; foto-streams alleen binnen de sessie-scope. `assertSameOrg`-checks op alle FK-input.
- **Anonieme weergave bevat nooit**: opdrachtgever-contactgegevens, andere documenten, prijzen/offertes, namen van andere herstellers. Inspecteur-contact strikt volgens `ContactDisplayMode` (bestaande `resolveInspectorContact`).
- **AVG**: invuller-e-mail alleen gebruikt voor bevestiging/conflictafhandeling, opgeslagen op de sessie; benoemen in de org-settings-uitlegtekst.
- **Sessieverloop**: 72 uur TTL; verlopen sessies → 401 met NL-melding "Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode." Claims van verlopen sessies blijven geldig (first-wins is al gebeurd).
- **Handtekening-integriteit**: zelfde waarborgen als bestaande ondertekening (`signedAt`, `signedIpAddress`, document daarna `SIGNED`/immutable).

## 14.12 Audit, seed & tests

- **Seed** (`SEED_DEMO=1`): InspeXi Demo-org krijgt `OrganizationFeature`-override `{ featureKey: 'ONLINE_HERSTEL', enabled: true }` + `onlineRepairDefault: true`; demo-inspectieplan: `referenceNumber` gevuld (bijv. `RAP-2026-001`), `onlineRepairEnabled: true`, één finding kritiek (`isCritical` via de geseede classificatie-optie), één afgeronde ANONYMOUS-`RepairSession` met `REPORTED`-resolution + foto + ondertekende herstelverklaring, en één open kritieke finding (zodat de herinspectie-trigger demo-baar blijft). System-lookup-rows (`REPORTED`, `CONFLICT`, `HERSTELLER`) altijd seeden (niet alleen demo).
- **Unit**: claim-transactie (win/verlies/dubbelclaim zelfde sessie), kritiek-check (incl. eenmaligheid en reset), `resolveProjectManager`-fallbacks, referenceNumber-validatie, `isCritical`-berekening (service + sync-mapper), complete-validaties (foto ≥1, vreemde resolutionIds, e-mail-verplichting), lookup-normalisatie (postcode/case).
- **E2E** (`client-repair.e2e-spec.ts`): lookup happy path + generieke fouten (fout nummer / foute postcode / feature uit / plan-vlag uit), volledige flow lookup → claim → foto → complete → sign, 409-conflictpad met bewaard concept, cross-tenant (sessie org A kan plan/foto's org B niet bereiken), throttling-status, teardown in `try/finally` (opruimvolgorde §14.5).
- **Client-portal Vitest**: herstel-overzicht (groepering, grijs-weergave, badge), wizard-validaties, conflictmelding.

## 14.13 Buiten scope / later

- **QR-code-toegang**: QR op het rapport met een direct-access-token → maakt dezelfde ANONYMOUS-`RepairSession` aan zonder invoer. Het sessiemodel en de guard zijn er klaar voor (alleen een extra `@Public()` entry-endpoint nodig).
- Org-configureerbare herstelverklaring-template via de block-editor (`DocumentTemplate` ondersteunt het `DocumentType` al).
- Staf-verificatieflow op herstelmeldingen (het `PENDING_VERIFICATION`-kanaal verrijken/samenvoegen).
- Daadwerkelijk inplannen van de administratieve herinspectie (nu alleen de vraag/notificatie; inplannen gaat via de bestaande planning-module).
- Persistent `findingNumber` per plan (nu deterministisch volgnummer in weergave + verklaring).
- Herinnerings-e-mails naar externen bij niet-afgeronde sessies.
- Automatisch nieuw (concept)rapport of statusovergang van het plan na herinspectie.

## 14.14 Gefaseerde implementatie

| Fase | Inhoud | Migratie? |
|---|---|---|
| 1 | Schema (RepairSession, FindingResolution-uitbreiding, isCritical ×2, DocumentType, org/plan-velden) + entitlement-key + lookup-system-rows + DTO's + backfill `Finding.isCritical` + seed-opruimvolgorde | ja |
| 2 | Backend `client-repair`-module: lookup/sessies/guard, claim-transactie + conflict, foto's, samenvatting, `isCritical`-onderhoud in findings/sync, referenceNumber-validatie | nee |
| 3 | Herstelverklaring (template + generatie + ondertekenen + PDF), e-mails, notificatietypes, kritiek-trigger, audit-registratie | ja (enum) |
| 4 | Client-portal UI: `/herstel`, overzicht, modal, afronden-wizard, ingelogde entry, grijs-weergave findings-tab | nee |
| 5 | Staf-portal UI: org-toggle, plan-toggle + URL, herstel/conflict-weergave, isCritical-beheer, documentlabel | nee |
| 6 | Seed-demo, E2E, Vitest, CLAUDE.md/docs-bijwerking | nee |

De uitvoerbare Claude Code-prompts per fase staan in `docs/IMP_PRD_14_APPLY-WITH-CLAUDE-CODE.md`.
