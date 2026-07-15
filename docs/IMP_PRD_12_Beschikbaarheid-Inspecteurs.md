# PRD-12 — Beschikbaarheid Inspecteurs

*Inspectie Management Platform — Module 12*
*Versie 1.0 | Juli 2026 | Vertrouwelijk — Intern gebruik*

> Implementatiefasering: zie `IMP_PRD_12_Implementatieplan.md`.

---

## 12.1 Doel

Het beschikbaarheidssysteem legt per inspecteur vast wanneer hij/zij inzetbaar is, zodat de planning (PRD-07) daar rekening mee kan houden. Het systeem ondersteunt twee dienstvormen met tegengestelde uitgangspunten:

- **Dienstverband**: standaard beschikbaar volgens een gekozen weekschema-template (bijv. "Standaard" ma–vr 08:00–17:30). Afwezigheid wordt geblokkeerd via uitzonderingen (eenmalig of herhalend).
- **Freelance**: standaard *niet* beschikbaar. Beschikbaarheid wordt actief toegevoegd (eenmalig of herhalend), eventueel op basis van een template.

Zowel de inspecteur zelf als manager-en-hoger beheren dit. Het eindresultaat is per dag en tijd opvraagbaar (resolved availability) voor kalenderweergave en planningswaarschuwingen.

Dit volgt het gangbare model van agenda-/booking-systemen (Google Calendar working hours, Microsoft Bookings, Calendly): **weekschema als baseline + uitzonderingen (overrides) er bovenop**, met herhaling als beperkte subset van iCalendar RRULE (`FREQ=WEEKLY`).

---

## 12.2 Kernconcepten & Terminologie

| Term | Betekenis |
|------|-----------|
| Dienstvorm | `DIENSTVERBAND` of `FREELANCE`, per inspecteur ingesteld door manager-en-hoger |
| Beschikbaarheidstemplate | Herbruikbaar weekschema per organisatie (bijv. "Standaard 40u", "Sjaak Parttime") met tijdsloten per weekdag |
| Schema-toewijzing | Koppeling inspecteur → template met ingangsdatum (`validFrom`), zodat schema-wissels historisch kloppen |
| Uitzondering (exception) | Eenmalige of wekelijks herhalende periode die beschikbaarheid **toevoegt** (`BESCHIKBAAR`) of **blokkeert** (`GEBLOKKEERD`) |
| Resolved availability | Het berekende eindresultaat per inspecteur per dag: lijst beschikbare tijdintervallen |
| Baseline | Startpunt van de berekening: templateslots (dienstverband) of leeg (freelance) |

---

## 12.3 Uitgangspunten & besluiten

1. **Beheer in de portal**; PWA-integratie is een latere, aparte stap (buiten scope, zie 12.11).
2. **Geen goedkeuringsflow**: wijzigingen door de inspecteur zelf zijn direct geldig; managers/planners krijgen een notificatie.
3. **Soft conflict-check**: inplannen buiten beschikbaarheid geeft een duidelijke waarschuwing, maar de planner kan bewust doorzetten (override-vlag).
4. **Eén tijdzone**: alle tijden zijn lokale wandkloktijd (Europe/Amsterdam). Weekschema's zijn tijdzone-loos (minuten vanaf middernacht); eenmalige uitzonderingen zijn absolute datums/tijden.
5. **Blokkades winnen altijd** van toegevoegde beschikbaarheid (zie precedentie in 12.5).
6. Dienstvorm en templates gelden per organisatie (multi-tenant, `orgId`-scoped zoals overal).
7. Naamgeving vermijdt de bestaande chat-presence enum `Availability` (User.availability); dit systeem gebruikt `AvailabilityTemplate` / `AvailabilityException` / `EmploymentType`.

---

## 12.4 Datamodel (Prisma)

Uitbreiding op `User`:

```prisma
model User {
  // ... bestaande velden ...
  employmentType      EmploymentType?            // null = geen inspecteur / n.v.t.
  scheduleAssignments UserScheduleAssignment[]
  availabilityExceptions AvailabilityException[]
}

enum EmploymentType {
  DIENSTVERBAND
  FREELANCE
}
```

Nieuwe modellen (tabellen met `imp_`-prefix zoals altijd):

```prisma
enum AvailabilityExceptionType {
  BESCHIKBAAR   // voegt beschikbaarheid toe (freelance-patroon, of extra dag dienstverband)
  GEBLOKKEERD   // blokkeert beschikbaarheid (verlof, afwezigheid)
}

model AvailabilityTemplate {
  id          String   @id @default(uuid())
  orgId       String
  name        String                     // "Standaard", "Sjaak Parttime"
  description String?
  isActive    Boolean  @default(true)
  isDeleted   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  organization Organization @relation(fields: [orgId], references: [id])
  slots        AvailabilityTemplateSlot[]
  assignments  UserScheduleAssignment[]

  @@unique([orgId, name])
  @@index([orgId, isDeleted])
  @@map("imp_availability_templates")
}

model AvailabilityTemplateSlot {
  id          String @id @default(uuid())
  templateId  String
  weekday     Int    // ISO-8601: 1 = maandag ... 7 = zondag
  startMinute Int    // minuten vanaf middernacht: 480 = 08:00
  endMinute   Int    // 1050 = 17:30

  template AvailabilityTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@index([templateId])
  @@map("imp_availability_template_slots")
}

model UserScheduleAssignment {
  id         String    @id @default(uuid())
  orgId      String
  userId     String
  templateId String
  validFrom  DateTime  // date-only (00:00 lokale tijd)
  validUntil DateTime? // null = doorlopend; gezet bij toewijzen van opvolger
  createdById String
  createdAt  DateTime  @default(now())

  user     User                 @relation(fields: [userId], references: [id])
  template AvailabilityTemplate @relation(fields: [templateId], references: [id])

  @@index([orgId, userId, validFrom])
  @@map("imp_user_schedule_assignments")
}

model AvailabilityException {
  id     String                    @id @default(uuid())
  orgId  String
  userId String
  type   AvailabilityExceptionType

  // Eenmalig (isRecurring = false): absolute periode
  startsAt DateTime?   // bijv. 2026-07-01 00:00
  endsAt   DateTime?   // bijv. 2026-07-24 23:59 (exclusief-einde in service-logica)
  allDay   Boolean     @default(false)

  // Herhalend (isRecurring = true): RRULE-subset FREQ=WEEKLY
  isRecurring    Boolean  @default(false)
  weekdays       Int[]    @default([])   // ISO 1..7
  startMinute    Int?                    // 60 = 01:00
  endMinute      Int?                    // 300 = 05:00
  intervalWeeks  Int      @default(1)    // 1 = wekelijks, 2 = tweewekelijks
  recurStartDate DateTime?               // vanaf (date-only)
  recurEndDate   DateTime?               // t/m (date-only), null = oneindig

  reason      String?
  createdById String     // wie heeft dit aangemaakt (inspecteur zelf of manager)
  isDeleted   Boolean    @default(false)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([orgId, userId, isDeleted])
  @@map("imp_availability_exceptions")
}
```

**Validatieregels (DTO/service):**
- Slot/exceptie: `0 <= startMinute < endMinute <= 1440`; sloten binnen één template+weekdag mogen niet overlappen.
- Eenmalig: `startsAt < endsAt` verplicht; herhalend: `weekdays` niet leeg, `startMinute/endMinute` verplicht (tenzij `allDay`), `recurStartDate` verplicht.
- Een exceptie is óf eenmalig óf herhalend — nooit beide veldensets gevuld.
- `assertSameOrg` op `userId`/`templateId` bij alle schrijfacties (cross-tenant isolatie).
- Template verwijderen (soft) kan alleen zonder actieve toewijzingen (`validUntil` null of in de toekomst).

**Seed-opruimvolgorde** (kinderen eerst, toevoegen aan `prisma/seed.ts`):
```
availabilityException → userScheduleAssignment → availabilityTemplateSlot → availabilityTemplate
```
(vóór `user` respectievelijk `organization`).

---

## 12.5 Beschikbaarheids-resolutie

Kernservice: `AvailabilityResolutionService` met pure, goed te unit-testen functies op tijdsintervallen (minuten binnen een dag).

Per inspecteur per dag `D`:

1. **Baseline**
   - `DIENSTVERBAND`: zoek de schema-toewijzing die geldig is op `D` (`validFrom <= D` en (`validUntil` null of `> D`)); neem de templateslots voor de weekdag van `D`. Geen toewijzing → leeg.
   - `FREELANCE` (of `employmentType` null): leeg.
2. **Plus-laag**: alle `BESCHIKBAAR`-excepties die `D` raken (eenmalig: datumbereik-overlap; herhalend: weekdag-match + `intervalWeeks`-check vanaf `recurStartDate` + binnen `recurStartDate..recurEndDate`) → intervallen **toevoegen** (union).
3. **Min-laag**: alle `GEBLOKKEERD`-excepties die `D` raken → intervallen **aftrekken** (subtract). `allDay` of een meerdaags bereik dat `D` volledig omvat → hele dag weg.
4. Resultaat normaliseren: gesorteerde, samengevoegde, niet-overlappende intervallen.

**Precedentie: GEBLOKKEERD > BESCHIKBAAR > baseline.** Een blokkade wint dus altijd, ongeacht aanmaakvolgorde.

`intervalWeeks`-check: `floor(dagenVerschil(maandagVan(recurStartDate), maandagVan(D)) / 7) % intervalWeeks === 0`.

Output-shape (per user per dag):

```json
{
  "userId": "…",
  "date": "2026-07-20",
  "intervals": [{ "startMinute": 480, "endMinute": 1050 }],
  "isAvailable": true,
  "sources": [{ "kind": "TEMPLATE" | "EXCEPTION", "id": "…", "type": "…" }]
}
```

`sources` maakt in de UI uitlegbaar *waarom* iemand (niet) beschikbaar is.

---

## 12.6 API-ontwerp

Nieuwe module `availability` (`apps/api/src/modules/availability/`), geregistreerd in `app.module.ts`. Alle routes onder `/api/v1/availability`. Rollen via bestaande sets uit `common/auth/roles.ts`: beheren van anderen = `MANAGEMENT_ROLES` (SUPERUSER, ORG_ADMIN, MANAGER); zelf beheren = alle stafrollen met service-check `userId === currentUser.id`; lezen (resolved) = plannersrollen (`CRM_ROLES`).

### Templates (manager en hoger)

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `GET /availability/templates` | Lijst | Org-scoped, incl. slots + aantal toewijzingen |
| `POST /availability/templates` | Aanmaken | Naam + slots in één payload |
| `GET /availability/templates/:id` | Detail | |
| `PATCH /availability/templates/:id` | Bijwerken | Slots worden integraal vervangen (delete + recreate binnen transactie) |
| `DELETE /availability/templates/:id` | Soft-delete | Alleen zonder actieve toewijzingen (anders 409) |

### Dienstvorm & schema-toewijzing (manager en hoger)

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `PATCH /users/:id` | Bestaand | `UpdateUserDto` uitbreiden met `employmentType` (alleen wijzigbaar door MANAGEMENT_ROLES) |
| `GET /availability/users/:userId/schedule` | Lezen | Actuele + historische toewijzingen |
| `PUT /availability/users/:userId/schedule` | Toewijzen | Body `{ templateId, validFrom }`; sluit de lopende toewijzing af op `validFrom` |
| `DELETE /availability/users/:userId/schedule/:assignmentId` | Verwijderen | Alleen toekomstige toewijzingen |

### Uitzonderingen (inspecteur zelf + manager en hoger)

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `GET /availability/exceptions?userId=&from=&to=` | Lijst | Zonder `userId`: eigen excepties. Andermans excepties alleen MANAGEMENT_ROLES |
| `POST /availability/exceptions` | Aanmaken | `userId` in body; niet-managers alleen voor zichzelf (anders 403) |
| `PATCH /availability/exceptions/:id` | Bijwerken | Zelfde autorisatieregel |
| `DELETE /availability/exceptions/:id` | Soft-delete | Zelfde autorisatieregel |

### Resolved & check (planners)

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `GET /availability/resolved?from=&to=&userIds=` | Berekend | Per user per dag intervallen + sources (zie 12.5). `from/to` max 3 maanden per request |
| `GET /availability/check?userId=&start=&end=` | Check | `{ available: boolean, coveredIntervals, conflicts[] }` — gebruikt door planning-integratie en frontend |

Alle responses in het bestaande `{ success, data }`-formaat; paginatie/`buildOrderBy`/`paginate` waar van toepassing; NL-foutmeldingen via `assertFound`.

---

## 12.7 Notificaties

Nieuwe `NotificationType`-waarden (dispatch fire-and-forget, zoals bestaand patroon):

| Type | Trigger | Ontvangers |
|---|---|---|
| `BESCHIKBAARHEID_GEWIJZIGD_DOOR_INSPECTEUR` | Inspecteur maakt/wijzigt/verwijdert eigen exceptie | MANAGEMENT_ROLES + WERKVOORBEREIDER van de org |
| `BESCHIKBAARHEID_GEWIJZIGD_DOOR_MANAGER` | Manager wijzigt schema/dienstvorm/exceptie van een inspecteur | De betreffende inspecteur |

Beide ook opnemen in `NotificationPref`-groepen (Nederlandse labels).

---

## 12.8 Portal UI

### a. Organisatie → Beschikbaarheid-templates (MANAGEMENT_ROLES)

Nieuwe pagina `pages/organization/availability-templates-page.tsx` volgens het standaard overzichtspatroon (`DetailPageLayout` + `TableConfigSidebar` + `useTableConfig`). Template-editor als modal of detailweergave: per weekdag 0..n tijdsloten (van/tot), live berekend totaal uren/week (bijv. "40,0 uur"). Sidebar-navigatie onder Organisatie, `roles`-filtering op MANAGEMENT_ROLES.

### b. Gebruikersdetail → tab "Beschikbaarheid"

`user-detail-page.tsx`: nieuwe `Tab`-waarde `beschikbaarheid` (naast `overzicht | certificering | instellingen`), alleen zichtbaar/relevant voor gebruikers met rol INSPECTEUR. Sectie-component `components/availability/user-availability-section.tsx` (patroon: `InspectorCertificatesSection`), met props `userId` + `canManage`:

1. **Dienstvorm**: select `DIENSTVERBAND`/`FREELANCE` — alleen bewerkbaar bij `canManage` (MANAGEMENT_ROLES).
2. **Weekschema** (alleen dienstverband): actuele template + ingangsdatum, knop "Schema wijzigen" (template-picker + `validFrom`), historie-lijstje.
3. **Uitzonderingen**: lijst (type-badge via `lib/status.ts`-map `AVAILABILITY_EXCEPTION_TYPE`, periode/patroon leesbaar geformatteerd, reden) + "Toevoegen"-modal met keuze *Eenmalig* (datum/tijd van–tot, hele dag-checkbox) of *Wekelijks herhalend* (weekdagen-multiselect, tijd van–tot, interval, vanaf/t-m).
4. **Maandkalender-preview**: compacte maandweergave van resolved availability (groen = beschikbaar met tijden, grijs = niet, rood accent = geblokkeerd), data via `GET /availability/resolved`. Eigen bouw met native `Date`, consistent met `planning-calendar-view.tsx`.

### c. "Mijn beschikbaarheid" (inspecteur)

Route `/my-availability`, sidebar-item zichtbaar voor rol INSPECTEUR. Hergebruikt `UserAvailabilitySection` met `userId = currentUser.id` en `canManage = false` (dienstvorm/schema read-only; excepties wél zelf beheren).

### d. Hooks & types

`pages/availability/hooks/use-availability.ts` volgens standaardpatroon (`useAvailabilityTemplates`, `useUserSchedule`, `useAvailabilityExceptions`, `useResolvedAvailability`, + create/update/delete-mutaties met invalidation). Types in `apps/portal/src/types/index.ts`. Datums via `lib/format.ts`; UI-voorkeuren via `tenantStorage`.

---

## 12.9 Planning-integratie (soft warnings)

1. **Backend**: `PlanningService.assignInspectors` en `PlanningSessionsService.assignSessionInspectors` roepen vóór het wegschrijven `AvailabilityService.check` aan per inspecteur voor de geplande datum/tijd(+duur). Bij één of meer conflicten en zonder override:
   - Response `409` met `{ success: false, message: "…", warnings: [{ userId, name, date, reason }] }`.
   - DTO's (`AssignInspectorsDto` e.d.) krijgen `overrideAvailabilityWarnings?: boolean`; met `true` wordt gewoon toegewezen en wordt de override in `PlanningHistory` gelogd (action `AVAILABILITY_OVERRIDE`).
   - Geen `scheduledDate` (NOG_TE_PLANNEN) → geen check.
2. **Portal — toewijzen**: bij 409-met-warnings toont de assign-modal een waarschuwingsdialoog ("Sjaak is niet beschikbaar op 20 juli (verlof). Toch inplannen?") met `useConfirm()`; bevestigen herhaalt de request met override-vlag.
3. **Portal — kalender**: `planning-calendar-view.tsx` krijgt een beschikbaarheids-overlay: bij een geselecteerde inspecteur(-filter) worden niet-beschikbare dagen/uren gedempt weergegeven (data uit `GET /availability/resolved` voor het zichtbare bereik).
4. **Portal — inspecteur-picker**: in de assign-modal per inspecteur een badge "Niet beschikbaar" wanneer `check` voor de gekozen datum negatief is (freelancers zonder opgegeven beschikbaarheid zijn dus standaard "niet beschikbaar").

---

## 12.10 Audit, seed & tests

**Audit trail**: `AvailabilityTemplate`, `UserScheduleAssignment` en `AvailabilityException` toevoegen aan `AUDITED_MODELS` + `MODEL_TABLE_MAP` (prisma.service.ts), FK-resolvers voor `userId`/`templateId`/`createdById` in `audit-log.service.ts`, `ALLOWED_ENTITY_TYPES`, NL-veldlabels in `audit-field-labels.ts` en enum-labels in `audit-value-format.ts`. `<AuditHistory>` in de beschikbaarheid-tab-sidebar.

**Seed** (`prisma/seed.ts`): opruimvolgorde uit 12.4; templates "Standaard" (ma–vr 08:00–17:30, 40u — pauze-aftrek buiten scope) en "Parttime ma/wo/do" (07:00–15:00); `inspecteur@inspexi-demo.nl` → DIENSTVERBAND + "Standaard" + 1 eenmalige blokkade + 1 wekelijkse blokkade; `inspecteur@testbedrijf.nl` → FREELANCE + herhalende BESCHIKBAAR-exceptie di+do.

**Tests**:
- Unit (zwaartepunt): `AvailabilityResolutionService` — interval-union/subtract, weekgrenzen, `intervalWeeks`, meerdaagse blokkades, allDay, freelancer-baseline, template-wissel op `validFrom`, precedentie GEBLOKKEERD > BESCHIKBAAR.
- Unit: services (autorisatie zelf-vs-manager, template-delete met actieve toewijzing → 409).
- E2E: `availability.e2e-spec.ts` (CRUD + resolved + check), uitbreiding `cross-tenant.e2e-spec.ts` (org A injecteert org B `templateId`/`userId` → 403), uitbreiding planning-e2e (assign met conflict → 409, met override → 201). Teardown-volgorde conform 12.4.
- Portal: Vitest voor interval-formatting en de exceptie-modal-validatie.

---

## 12.11 Buiten scope / toekomstige uitbreidingen

- **PWA-integratie**: excepties beheren vanuit de inspecteurs-app via het sync-contract (aparte fase, aparte repo `../Inspexi-App`).
- **Goedkeuringsflow** voor blokkades (verlofaanvragen met status aangevraagd/goedgekeurd).
- **Verlofsaldi/urenregistratie** — dit systeem registreert inzetbaarheid, geen verlofrechten.
- **Volledige RRULE-ondersteuning** (maandelijks, BYSETPOS, uitzonderingsdatums EXDATE); het datamodel (RRULE-subset) is hierop voorbereid.
- **Feestdagen** als org-brede blokkadelaag.
- **Capaciteitsplanning/suggesties**: automatisch inspecteurs voorstellen op basis van beschikbaarheid + reisafstand (home-geo-velden bestaan al op User).
- **iCal-export** van beschikbaarheid (naast de bestaande planning-feed).
