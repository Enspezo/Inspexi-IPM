# PRD-12 — Projectfasen (deelprojecten binnen een project)

*Inspectie Management Platform — Module 12*
*Versie 1.0 | Juli 2026 | Vertrouwelijk — Intern gebruik*

---

## 12.1 Doel

Projecten met meerdere locaties, uitvoeringsdagen en contactpersonen zijn nu één platte container. Deze module voegt een **lichte tussenlaag "Fase"** toe onder `Project`: een plat (niet-recursief) groeperingsniveau met eigen status, eigen volgers, milestones met reminders, en een voorbereide haak voor deelfacturen (PRD-08).

Bewuste ontwerpkeuze: **géén self-referencing Project** (subprojecten als volwaardige projecten). Dat zou nummering, roll-up, rapportage en alle project-koppelpunten raken. Een fase is een groepering bínnen een project; de bestaande fijnmazigheid (InspectionPlan per locatie, PlanningSession per dag, contactpersoon per plan/planregel) blijft het uitvoeringsniveau.

**Use-case:** inspectie van 5 panden verspreid over 3 weken → 1 project met 5 fasen (per pand), elk met eigen locatie, contactpersoon, datumrange, status, volgers en milestones ("Rapportage pand A gereed", "Herinspectie ingepland").

---

## 12.2 Kernconcepten & Terminologie

| Term | Betekenis |
|------|-----------|
| Fase | Deelproject/groepering binnen een project, met eigen status en doorlooptijd. Maximaal één niveau diep (geen fasen binnen fasen) |
| Fasevolger | Interne gebruiker of externe (e-mail) volger van één specifieke fase, met dezelfde zichtbaarheidsvlaggen als projectvolgers. Bij het aanmaken van een fase worden de projectvolgers als startset gekopieerd; daarna per fase vrij te beheren (verwijderen/toevoegen) |
| Milestone | Mijlpaal binnen een fase met streefdatum, verantwoordelijke en automatische reminder-notificaties |
| Fase-koppeling | Optionele FK `projectPhaseId` op bestaande entiteiten (inspectieplan, planregel, werkbon, offerte) resp. nieuwe `PROJECT_PHASE` entityType (taken, documenten, notities) |
| Offerte-fallback | Heeft een fase geen eigen offerte(s), dan tonen we de offertes van het bovenliggende project ("via project") |

---

## 12.3 Datamodel (Prisma)

Naamgeving volgens codebase-conventie: modellen/velden Engels, tabellen `imp_`-prefix, UI-labels Nederlands.

### 12.3.1 Nieuwe enums

```prisma
enum PhaseStatus {
  NIET_GESTART
  ACTIEF
  ON_HOLD
  AFGEROND
  GEANNULEERD
}

enum MilestoneStatus {
  OPEN
  BEHAALD
  VERVALLEN
}
```

### 12.3.2 ProjectPhase

```prisma
model ProjectPhase {
  id              String      @id @default(uuid()) @db.Uuid
  orgId           String      @map("org_id") @db.Uuid
  projectId       String      @map("project_id") @db.Uuid
  name            String
  description     String?
  status          PhaseStatus @default(NIET_GESTART)
  sortOrder       Int         @default(0) @map("sort_order")

  // Eigen context per fase (alles optioneel — erft anders visueel van het project)
  locationId      String?     @map("location_id") @db.Uuid          // CRM-Location
  contactPersonId String?     @map("contact_person_id") @db.Uuid    // ContactPerson van het projectcontact
  startDate       DateTime?   @map("start_date") @db.Date
  expectedEndDate DateTime?   @map("expected_end_date") @db.Date
  completedAt     DateTime?   @map("completed_at")

  // Haak voor deelfacturatie (PRD-08); nu alleen registratie
  budgetAmount    Decimal?    @map("budget_amount") @db.Decimal(12, 2)

  isDeleted       Boolean     @default(false) @map("is_deleted")
  deletedAt       DateTime?   @map("deleted_at")
  createdBy       String      @map("created_by") @db.Uuid
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  organization  Organization           @relation(fields: [orgId], references: [id])
  project       Project                @relation(fields: [projectId], references: [id])
  location      Location?              @relation(fields: [locationId], references: [id])
  contactPerson ContactPerson?         @relation(fields: [contactPersonId], references: [id])
  createdByUser User                   @relation("PhaseCreatedByUser", fields: [createdBy], references: [id])
  followers     ProjectPhaseFollower[]
  milestones    PhaseMilestone[]

  inspectionPlans InspectionPlan[]
  planningItems   PlanningItem[]
  workOrders      WorkOrder[]
  quotes          Quote[]

  @@index([orgId, projectId, sortOrder])
  @@index([projectId, status])
  @@map("imp_project_phases")
}
```

Geen aparte nummering via de nummering-engine: het fasenummer is de (1-based) positie op basis van `sortOrder`, weergave "Fase 2 — Verdieping Noord". Geen `@@unique([projectId, sortOrder])` — dat maakt herordenen (swap) onnodig lastig; de service herschrijft `sortOrder` atomair bij reorder.

### 12.3.3 ProjectPhaseFollower

Spiegel van `ProjectFollower` (zelfde vlaggen, zodat portaal-componenten en toekomstige client-portal-logica herbruikbaar zijn):

```prisma
model ProjectPhaseFollower {
  id               String   @id @default(uuid()) @db.Uuid
  phaseId          String   @map("phase_id") @db.Uuid
  userId           String?  @map("user_id") @db.Uuid
  email            String?
  name             String?
  canViewGeneral   Boolean  @default(true) @map("can_view_general")
  canViewRequests  Boolean  @default(false) @map("can_view_requests")
  canViewQuotes    Boolean  @default(true) @map("can_view_quotes")
  canViewPlanning  Boolean  @default(true) @map("can_view_planning")
  canViewDocuments Boolean  @default(false) @map("can_view_documents")
  createdAt        DateTime @default(now()) @map("created_at")

  phase ProjectPhase @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  user  User?        @relation(fields: [userId], references: [id])

  @@index([phaseId])
  @@map("imp_project_phase_followers")
}
```

### 12.3.4 PhaseMilestone

```prisma
model PhaseMilestone {
  id                 String          @id @default(uuid()) @db.Uuid
  orgId              String          @map("org_id") @db.Uuid
  phaseId            String          @map("phase_id") @db.Uuid
  title              String
  description        String?
  dueDate            DateTime        @map("due_date") @db.Date
  status             MilestoneStatus @default(OPEN)
  completedAt        DateTime?       @map("completed_at")
  assigneeId         String?         @map("assignee_id") @db.Uuid
  reminderDaysBefore Int             @default(7) @map("reminder_days_before")

  // Dedupe-patroon identiek aan MeasurementInstrumentsScheduler
  lastReminderStage  String?         @map("last_reminder_stage") // 'upcoming' | 'overdue'
  lastReminderAt     DateTime?       @map("last_reminder_at")

  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id])
  phase        ProjectPhase @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  assignee     User?        @relation("MilestoneAssignee", fields: [assigneeId], references: [id])

  @@index([phaseId, dueDate])
  @@index([orgId, status, dueDate])
  @@map("imp_project_phase_milestones")
}
```

### 12.3.5 Wijzigingen aan bestaande modellen

Optionele FK `projectPhaseId` (`project_phase_id`, `@db.Uuid`, relatie `ProjectPhase?`) op:

| Model | Opmerking |
|---|---|
| `InspectionPlan` | Naast bestaand `projectId`; fase moet bij hetzelfde project horen |
| `PlanningItem` | Idem |
| `WorkOrder` | Werkbon heeft nu géén `projectId` — koppeling loopt volledig via de fase |
| `Quote` | Naast bestaand `projectId`; fallback-regel zie §12.4 |

Enum-uitbreidingen (bestaand entityType-patroon, geen FK):

- `TaskEntityType` → + `PROJECT_PHASE`
- `DocumentEntityType` → + `PROJECT_PHASE`
- `NoteEntityType` → + `PROJECT_PHASE`

**PWA/sync-impact: geen.** `InspectionPlan.projectPhaseId` is een backoffice-veld; het komt niet in het v3-synccontract en wordt in de sync-mapper genegeerd (server-only, zoals `orgId`).

---

## 12.4 Businessregels

1. **Eén niveau diep.** Een fase hoort bij precies één project; fasen kunnen niet genest worden. Er is bewust geen `parentPhaseId`.
2. **Projectconsistentie.** Bij het zetten van `projectPhaseId` op een entiteit valideert de service: fase bestaat, zelfde org (`assertSameOrg`), én `phase.projectId === entity.projectId`. Heeft de entiteit nog geen `projectId` (of een andere), dan wordt `projectId` automatisch meegezet naar `phase.projectId` (werkbon: alleen fasekoppeling). Dit voorkomt "fase van project A op offerte van project B".
3. **Offerte-fallback.** De fase-weergave "Offertes" toont: offertes met `projectPhaseId = fase.id`; zijn die er niet, dan de offertes van het project, visueel gemarkeerd als *"via project"*. Deelfacturatie (PRD-08) gebruikt later dezelfde regel: factureer de fase-offerte, anders naar rato vanuit de projectofferte.
4. **Status is handmatig, voortgang is afgeleid.** Fasestatus wordt door gebruikers gezet (kanban-achtig, zoals `ProjectStatus`). Er is géén automatische roll-up naar projectstatus. Wel afgeleide voortgang: het project toont "x van y fasen afgerond"; bij het afronden van een project met open fasen toont de portal een niet-blokkerende waarschuwing (`useConfirm`).
5. **`completedAt`** wordt automatisch gezet/geleegd bij statuswissel naar/van `AFGEROND`.
6. **Milestones.** `status OPEN` + `dueDate` in het verleden ⇒ visueel "verlopen" (rood), maar de status blijft `OPEN` tot een gebruiker `BEHAALD` of `VERVALLEN` kiest. Reminders: zie §12.6.
7. **Verwijderen.** Soft-delete (`isDeleted`), conform de rest van het platform. Een fase met gekoppelde entiteiten kan pas verwijderd worden nadat die ontkoppeld zijn (400 met duidelijke NL-melding en aantallen); milestones en volgers cascaden mee (milestones hard via `onDelete: Cascade` is acceptabel omdat de fase zelf soft-deleted blijft — de service zet bij soft-delete de open milestones op `VERVALLEN`).
8. **Rollen.** Zelfde schrijfrechten als project: `SUPERUSER, ORG_ADMIN, MANAGER, BACKOFFICE, WERKVOORBEREIDER`; `INSPECTEUR` leest mee. `budgetAmount` is alleen zichtbaar én bewerkbaar voor de `canWrite`-rollen.
9. **Volger-overerving.** Bij het aanmaken van een fase kopieert de service alle actieve projectvolgers (incl. vlaggen) als fasevolgers — een **snapshot**, geen live koppeling. Daarna zijn fasevolgers per fase onafhankelijk te beheren; latere wijzigingen aan projectvolgers propageren niet naar bestaande fasen.
10. **Project afronden met open fasen** geeft alleen een niet-blokkerende waarschuwing (zie regel 4), nooit een harde blokkade. Hetzelfde geldt voor een fase → `AFGEROND` terwijl gekoppelde inspectieplannen nog open staan.

---

## 12.5 API-ontwerp

Nieuwe module `project-phases` (eigen controller + service; **niet** in de al grote `projects`-module). Routes genest onder het project (globale prefix `/api/v1` komt er automatisch voor):

```
@Controller('projects/:projectId/phases')
```

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `/projects/:projectId/phases` | GET | Fasen van het project incl. `_count` van gekoppelde entiteiten + milestone-samenvatting |
| `/projects/:projectId/phases` | POST | Fase aanmaken (`sortOrder` = max+1; kopieert projectvolgers als startset, zie §12.4.9) |
| `/projects/:projectId/phases/reorder` | POST | `{ orderedIds: string[] }` → herschrijft `sortOrder` in één transactie |
| `/projects/:projectId/phases/:id` | GET | Detail incl. milestones, volgers, gekoppelde entiteiten |
| `/projects/:projectId/phases/:id` | PATCH | Bijwerken (naam, status, locatie, contactpersoon, data, budget) |
| `/projects/:projectId/phases/:id` | DELETE | Soft-delete (zie regel 7) |
| `/projects/:projectId/phases/:id/followers` | GET/POST | Volgers lijst/toevoegen |
| `/projects/:projectId/phases/:id/followers/:followerId` | PATCH/DELETE | Volger bijwerken/verwijderen |
| `/projects/:projectId/phases/:id/milestones` | GET/POST | Milestones lijst/toevoegen |
| `/projects/:projectId/phases/:id/milestones/:milestoneId` | PATCH/DELETE | Milestone bijwerken (incl. status) /verwijderen |

Let op de bestaande conventie: specifieke routes (`reorder`) vóór parameterroutes (`:id`) in de controller.

**Koppelen van entiteiten** gebeurt via de bestáánde update-endpoints: `UpdateInspectionPlanDto`, `UpdatePlanningDto`, `UpdateWorkOrderDto`, `UpdateQuoteDto` krijgen een optioneel `projectPhaseId?: string | null` (met de validatie uit §12.4.2). De bestaande `link-entities-modal` op het project krijgt een fase-kolom/-selectie.

Alle queries: `orgScope(user)` + `isDeleted: false` expliciet, `paginate()`/`buildOrderBy()` waar van toepassing, `assertFound(phase, 'Fase')`.

---

## 12.6 Notificaties & Scheduler

### 12.6.1 Nieuwe NotificationTypes

| Type | Trigger | Ontvangers |
|---|---|---|
| `FASE_STATUS_GEWIJZIGD` | Statuswissel van een fase | Projectmanager + fasevolgers (interne) |
| `MILESTONE_HERINNERING` | `dueDate - reminderDaysBefore` bereikt, status `OPEN` | Milestone-assignee + projectmanager + fasevolgers |
| `MILESTONE_VERLOPEN` | `dueDate` verstreken, status `OPEN` | Idem |

Dispatch via `NotificationsService.dispatch()` (fire-and-forget, creator uitgesloten), prefs werken automatisch mee via de bestaande `NotificationPref`/`NotificationGroupPref`-mechaniek. Externe volgers (alleen e-mail, geen `userId`) krijgen **uitsluitend** bij `FASE_STATUS_GEWIJZIGD` een e-mail via hetzelfde pad als projectvolgers (`projects.service.ts`-patroon); milestone-notificaties zijn intern.

### 12.6.2 ProjectPhasesScheduler

Nieuwe `project-phases.scheduler.ts`, gemodelleerd naar `MeasurementInstrumentsScheduler`:

- `@Cron(CronExpression.EVERY_DAY_AT_6AM)` → `processDueMilestones(now)` (kern-logica testbaar met vaste `now`).
- Selecteert milestones `status: OPEN` waarvan `dueDate <= now + reminderDaysBefore` (join op niet-verwijderde fase + actief project).
- Stage-bepaling: `overdue` als `dueDate < now`, anders `upcoming`. Dedupe via `lastReminderStage`/`lastReminderAt`; stage reset bij wijziging van `dueDate` of status terug naar `OPEN`.
- Ontvangers per milestone batchen per org (zoals de kalibratie-scheduler admins batcht).

---

## 12.7 Portal UI

### 12.7.1 Projectdetail — nieuwe tab "Fasen"

Tab-volgorde: Overzicht · **Fasen** (met count) · Aanvragen · Offertes · Planning · Volgers.

- Kaartenlijst gesorteerd op `sortOrder`, herordenen met **@dnd-kit** (al aanwezig via het kanban-bord).
- Per kaart: fasenummer + naam, `StatusBadge` (nieuwe `PHASE_STATUS`-map in `lib/status.ts`), locatie, contactpersoon, datumrange (`formatDate`), milestone-samenvatting ("2/3 behaald, 1 verlopen" met kleuraccent), counts van gekoppelde entiteiten.
- Kaart klapt uit (expandable, geen aparte route in v1) naar drie secties:
  1. **Details** — inline bewerken volgens het standaard InfoField ⇄ form-patroon (react-hook-form + zod);
  2. **Milestones** — tijdlijn/lijst met due-date, assignee, status-toggle (`MILESTONE_STATUS`-map), "+ Milestone"-modal;
  3. **Volgers & koppelingen** — hergebruik van `add-follower-modal`-patroon; gekoppelde inspectieplannen/planregels/werkbonnen/offertes met ontkoppel-actie en de offerte-fallback-weergave (*"via project"*).
- Kop van de tab: "+ Fase"-knop (`canWrite`-rollen).

### 12.7.2 Overige portal-aanpassingen

- **Project-overzichtstab**: voortgangsregel "x/y fasen afgerond".
- **Koppel-modals** (`link-entities-modal`, offerte-/planning-/inspectieplan-detail): optionele fase-select (gevuld met fasen van het gekozen project; disabled zolang geen project gekozen).
- **`lib/status.ts`**: `PHASE_STATUS` en `MILESTONE_STATUS` maps — nergens lokaal definiëren.
- **Hooks**: `pages/projects/hooks/use-project-phases.ts` met `useProjectPhases(projectId)`, `useCreatePhase`, `useUpdatePhase`, `useDeletePhase`, `useReorderPhases`, `usePhaseMilestones`, mutaties invalideren `['projects', projectId]` + `['project-phases', projectId]`.
- **Types**: `ProjectPhase`, `ProjectPhaseFollower`, `PhaseMilestone` in `apps/portal/src/types/index.ts`.

---

## 12.8 Audit trail

1. `ProjectPhase` en `PhaseMilestone` toevoegen aan het centrale audit-register in `apps/api/src/common/audit/audited-entities.ts` (`AUDITED_MODELS` + `MODEL_TABLE_MAP`); volgers volgen het `ProjectFollower`-precedent: niet ge-audit.
2. `FK_FIELD_RESOLVERS` in `audit-log.service.ts`: `projectId` → projecttitel, `locationId` → adres, `contactPersonId` → naam, `assigneeId`/`createdBy` → gebruikersnaam, `phaseId` → fasenaam.
3. `ALLOWED_ENTITY_TYPES` uitbreiden; `<AuditHistory entityType="ProjectPhase" …/>` in de uitgeklapte fasekaart.
4. Nederlandse veldlabels in `apps/portal/src/lib/audit-field-labels.ts`; enum-labels (`PhaseStatus`, `MilestoneStatus`) in `lib/audit-value-format.ts`.

---

## 12.9 Migratie, seed & tests

**Migratie** (vanuit `apps/api/`, nooit `db push`): `npx prisma migrate dev --name add-project-phases` — 3 nieuwe tabellen, 2 enums, 4 nullable FK-kolommen, 3 enum-uitbreidingen. Volledig backwards-compatible: alles optioneel, bestaande data hoeft niet gemigreerd.

**Seed** (`prisma/seed.ts`):
- Cleanup-volgorde, kinderen eerst, direct vóór `project`-cleanup: `phaseMilestone → projectPhaseFollower → projectPhase → projectFollower → project` (de entiteiten met `projectPhaseId` worden al eerder opgeruimd, dus geen FK-conflict; FK's zijn bovendien nullable).
- Seed-data: demo-project krijgt 2 fasen ("Fase 1 — Kantoorpand Zuidas", `ACTIEF`, gekoppeld aan het demo-inspectieplan; "Fase 2 — Herinspectie", `NIET_GESTART`) met elk 1–2 milestones (waarvan één met due-date binnen 7 dagen, voor demo van de reminder) en 1 volger.

**Tests**:
- Unit: `project-phases.service.spec.ts` (CRUD, reorder, consistentieregel §12.4.2, volger-kopie bij create §12.4.9, delete-blokkade, milestone-statusovergangen) + schedulertest met vaste `now` (stages, dedupe) naar het voorbeeld van de kalibratie-scheduler.
- E2E: nieuwe suite `project-phases.e2e-spec.ts`; `cross-tenant.e2e-spec.ts` uitbreiden met `projectPhaseId`-injectie (org A zet fase van org B op offerte/planregel → 403). Teardown-volgorde aanhouden; fixtures met `e2e-`-prefix.

---

## 12.10 Buiten scope v1 (bewuste hooks)

| Onderwerp | Hook in v1 | Uitwerking later |
|---|---|---|
| Deelfacturen per fase | `budgetAmount`, `Quote.projectPhaseId`, offerte-fallback-regel | PRD-08: `Invoice.projectPhaseId?`, factuurtrigger bij fase → `AFGEROND` |
| Client-portal | Volger-vlaggen identiek aan projectvolgers | Fase-voortgang tonen aan klant, magic-link scope per fase |
| Fase-afhankelijkheden | — | "Fase 2 start na fase 1" + automatische statussuggestie |
| Gantt-/tijdlijnweergave | `startDate`/`expectedEndDate` aanwezig | Planning-visualisatie over fasen heen |
| PWA | Geen (server-only veld) | Eventueel fase-naam read-only tonen bij het plan |

---

## 12.11 Implementatiefasering

1. **Fase A — Datamodel & API**: migratie, `project-phases`-module (CRUD + reorder + volgers + milestones), consistentievalidatie, DTO-uitbreidingen op de 4 entiteiten, audit-registratie, seed, unit + E2E.
2. **Fase B — Portal**: tab "Fasen" met kaarten, inline bewerken, milestones-UI, volgers-UI, status-maps, hooks, voortgang op projectoverzicht.
3. **Fase C — Notificaties & scheduler**: 3 nieuwe NotificationTypes, dispatch bij statuswissel, `ProjectPhasesScheduler`, e-mail naar externe volgers.
4. **Fase D — Koppelintegratie**: fase-select in koppel-modals en detailpagina's van offerte/planning/inspectieplan/werkbon, offerte-fallback-weergave.

Elke fase is los shippable; A+B leveren al de kernwaarde (structuur + statusbewaking). Kant-en-klare Claude Code-prompts per fase staan in §12.13.

---

## 12.12 Besluiten

1. Fase → `AFGEROND` met open gekoppelde inspectieplannen: **alleen een waarschuwing** (niet-blokkerend), consistent met regel 4/10.
2. Externe fasevolgers krijgen **alleen statuswissel-e-mails**; milestone-notificaties zijn intern (§12.6.1).
3. `budgetAmount` is **alleen zichtbaar/bewerkbaar voor `canWrite`-rollen** (regel 8).
4. Fasevolgers worden bij aanmaken **gekopieerd van het project** (snapshot) en daarna per fase onafhankelijk beheerd (regel 9).

---

## 12.13 Claude Code-prompts per implementatiefase

**Gebruik:** dit PRD leeft bewust *buiten* de repo. Kopieer het bestand vóór elke sessie tijdelijk naar de repo-root als `PRD-12-PROJECTFASEN.md` (of sleep het de sessie in), start Claude Code in de repo-root en plak de prompt van de betreffende fase. Voer de fasen in volgorde uit; commit pas na groene build + tests en verwijder de tijdelijke PRD-kopie vóór de commit (of zet hem in `.gitignore`).

### Prompt Fase A — Datamodel & API

```text
Lees eerst CLAUDE.md volledig, en daarna het meegeleverde bestand PRD-12-PROJECTFASEN.md
(vooral §12.3 datamodel, §12.4 businessregels, §12.5 API en §12.9 migratie/seed/tests).

Implementeer Fase A van PRD-12: het datamodel en de API voor projectfasen.

1. Prisma-schema (apps/api/prisma/schema.prisma):
   - Nieuwe enums PhaseStatus en MilestoneStatus exact volgens PRD §12.3.1.
   - Nieuwe modellen ProjectPhase (imp_project_phases), ProjectPhaseFollower
     (imp_project_phase_followers) en PhaseMilestone (imp_project_phase_milestones)
     exact volgens PRD §12.3.2–12.3.4, inclusief alle @map's, indexes en relaties.
     Voeg de back-relations toe op Organization, Project, Location, ContactPerson en User.
   - Optionele FK projectPhaseId (project_phase_id, @db.Uuid) + relatie op:
     InspectionPlan, PlanningItem, WorkOrder en Quote.
   - Enum-uitbreidingen: TaskEntityType, DocumentEntityType en NoteEntityType
     krijgen elk de waarde PROJECT_PHASE.
   - Migratie: cd apps/api && npx prisma migrate dev --name add-project-phases
     (nooit vanuit de root; NOOIT prisma db push).

2. Nieuwe API-module apps/api/src/modules/project-phases/ met controller
   @Controller('projects/:projectId/phases') (het globale prefix /api/v1 komt er
   automatisch voor), service, dto/ en module-registratie in app.module.ts.
   Endpoints exact volgens PRD §12.5, inclusief reorder, followers- en
   milestones-subroutes. Let op: specifieke routes (reorder) vóór :id-routes.
   - Gebruik de shared helpers uit @/common: orgScope(user), paginate(), buildOrderBy(),
     assertFound(entity, 'Fase') en assertSameOrg/assertAllSameOrg voor alle FK-UUID's
     (locationId, contactPersonId, assigneeId). isDeleted: false expliciet in elke query.
   - POST create: sortOrder = max+1 binnen het project, en kopieer de projectvolgers
     (ProjectFollower) van het parent-project als ProjectPhaseFollower-snapshot (§12.4.9).
   - POST reorder: { orderedIds: string[] } → valideer dat de set exact de niet-verwijderde
     fasen van het project is en herschrijf sortOrder in één $transaction.
   - PATCH status: zet/leeg completedAt bij wissel naar/van AFGEROND (§12.4.5); zet bij
     soft-delete open milestones op VERVALLEN (§12.4.7). Soft-delete weigeren (400, NL-melding
     met aantallen) zolang er gekoppelde inspectieplannen/planregels/werkbonnen/offertes zijn.
   - Rollen: schrijfacties @Roles voor SUPERUSER/ORG_ADMIN/MANAGER/BACKOFFICE/WERKVOORBEREIDER.
     budgetAmount alleen in responses voor die rollen (strip voor INSPECTEUR, §12.4.8).

3. Koppelvalidatie op bestaande modules: voeg optioneel projectPhaseId?: string | null toe
   aan de update/create-DTO's van inspection-plans, planning, work-orders en quotes.
   In de services: bij het zetten van projectPhaseId → assertSameOrg + valideer
   phase.projectId === entity.projectId; zet projectId automatisch mee naar
   phase.projectId als de entiteit die nog niet (of anders) heeft (§12.4.2).
   WorkOrder heeft geen projectId: daar alleen org- en bestaanscheck op de fase.

4. Audit: registreer ProjectPhase en PhaseMilestone in
   apps/api/src/common/audit/audited-entities.ts (AUDITED_MODELS + MODEL_TABLE_MAP +
   ALLOWED_ENTITY_TYPES) en voeg FK_FIELD_RESOLVERS toe in audit-log.service.ts
   (projectId→titel, locationId→adres, contactPersonId→naam, assigneeId/createdBy→naam,
   phaseId→fasenaam). Volgers worden niet ge-audit (ProjectFollower-precedent).

5. Seed (apps/api/prisma/seed.ts): cleanup-volgorde kinderen eerst —
   phaseMilestone → projectPhaseFollower → projectPhase → (bestaande volgorde) —
   direct vóór de project-cleanup. Seed-data volgens PRD §12.9: 2 fasen op het
   demo-project (één ACTIEF gekoppeld aan het demo-inspectieplan, één NIET_GESTART),
   elk met 1–2 milestones (waarvan één met dueDate binnen 7 dagen) en 1 volger.

6. Tests:
   - Unit (project-phases.service.spec.ts): CRUD, reorder, volger-kopie bij create,
     consistentieregel §12.4.2 (fout project → 400), delete-blokkade bij koppelingen,
     completedAt-gedrag, milestone-statusovergangen.
   - E2E (test/project-phases.e2e-spec.ts): volledige flow via HTTP; fixtures met
     e2e-prefix; teardown in try/finally met app.close() in de finally, opruimvolgorde
     phaseMilestone → projectPhaseFollower → projectPhase → project → auditLog →
     invitation → refreshToken → user → organization.
   - Breid test/cross-tenant.e2e-spec.ts uit: org A injecteert een projectPhaseId van
     org B op een offerte en een planregel → verwacht 403.

Definition of done: npx turbo run build groen vanuit de root, cd apps/api && pnpm test
en pnpm test:e2e groen (E2E nooit parallel met een andere run), Swagger toont de nieuwe
endpoints onder /api/docs. Commit (Engels, met Co-Authored-By Claude):
"feat: implement PRD-12 phase A — project phases data model & API".
```

### Prompt Fase B — Portal-UI

```text
Lees eerst CLAUDE.md volledig, en daarna het meegeleverde bestand PRD-12-PROJECTFASEN.md
(vooral §12.7 portal-UI, §12.4 businessregels en §12.12 besluiten). Fase A (API) is al
gemerged; verifieer dat met een blik op apps/api/src/modules/project-phases/.

Implementeer Fase B van PRD-12: de portal-UI voor projectfasen.

1. Types & hooks:
   - ProjectPhase, ProjectPhaseFollower, PhaseMilestone interfaces in
     apps/portal/src/types/index.ts (velden 1-op-1 met de API-responses).
   - apps/portal/src/pages/projects/hooks/use-project-phases.ts met
     useProjectPhases(projectId), useCreatePhase, useUpdatePhase, useDeletePhase,
     useReorderPhases, usePhaseMilestones + mutaties, usePhaseFollowers + mutaties.
     Alles via apiClient + TanStack Query; mutaties invalideren ['projects', projectId]
     én ['project-phases', projectId]. Let op: apiClient.get() accepteert maar één
     argument — query params in de URL-string.

2. Status-maps in apps/portal/src/lib/status.ts (NOOIT lokaal definiëren):
   - PHASE_STATUS: NIET_GESTART (grijs), ACTIEF (groen), ON_HOLD (amber),
     AFGEROND (blauw), GEANNULEERD (rood) — Nederlandse labels.
   - MILESTONE_STATUS: OPEN (grijs/amber), BEHAALD (groen), VERVALLEN (rood).

3. Nieuwe tab "Fasen" op apps/portal/src/pages/projects/project-detail-page.tsx,
   tussen Overzicht en Aanvragen, met count. Bouw de tab-inhoud als co-located
   component pages/projects/components/project-phases-tab.tsx (data via props,
   niet opnieuw fetchen). UI volgens PRD §12.7.1:
   - Kaarten gesorteerd op sortOrder; drag-and-drop herordenen met @dnd-kit
     (optimistic update + rollback bij error, zoals requests-kanban.tsx).
   - Per kaart: "Fase {n} — {naam}", StatusBadge, locatie, contactpersoon,
     datumrange via formatDate uit lib/format.ts, milestone-samenvatting,
     counts van gekoppelde entiteiten.
   - Uitklapbare kaart met drie secties: Details (inline bewerken volgens het
     InfoField ⇄ form-patroon met react-hook-form + zod, "Opslaan" disabled={!isDirty}),
     Milestones (lijst + status-toggle + "+ Milestone"-modal met titel/omschrijving/
     dueDate/assignee via useUsers()/reminderDaysBefore), Volgers & koppelingen
     (hergebruik het add-follower-modal-patroon; gekoppelde entiteiten met
     ontkoppel-actie; offertes tonen de fallback "via project" als de fase geen
     eigen offertes heeft, §12.4.3).
   - "+ Fase"-knop alleen voor canWrite-rollen; budgetAmount-veld alleen tonen/
     bewerken voor canWrite-rollen (§12.12.3).
   - Verwijderen via useConfirm() — NOOIT window.confirm. Toon de API-foutmelding
     (met aantallen) als de fase nog koppelingen heeft.
   - <AuditHistory entityType="ProjectPhase" entityId={phase.id} /> in de
     uitgeklapte kaart.

4. Project-overzichtstab: voortgangsregel "x van y fasen afgerond"; bij statuswissel
   van het project naar AFGEROND met open fasen een niet-blokkerende waarschuwing
   via useConfirm (§12.12.1).

5. Audit-vertalingen: Nederlandse veldlabels voor ProjectPhase/PhaseMilestone in
   lib/audit-field-labels.ts en enum-labels (PhaseStatus, MilestoneStatus) in
   lib/audit-value-format.ts.

6. Tests: Vitest voor de reorder-helper en de milestone-samenvattingslogica
   (cd apps/portal && pnpm test).

Definition of done: npx turbo run build groen, portal-tests groen, en een handmatige
browser-smoketest op http://inspexidemo.localhost:5173 (login admin@inspexi-demo.nl /
Password123!): fasen zichtbaar op het demo-project, aanmaken/bewerken/herordenen/
verwijderen werkt, milestones en volgers beheerbaar. Let op: pnpm db:seed wist de hele
DB incl. users — daarna opnieuw inloggen en bij een stale tenant-cache de API herstarten.
Commit: "feat: implement PRD-12 phase B — project phases portal UI".
```

### Prompt Fase C — Notificaties & scheduler

```text
Lees eerst CLAUDE.md volledig, en daarna het meegeleverde bestand PRD-12-PROJECTFASEN.md
(vooral §12.6 notificaties/scheduler en §12.12 besluiten). Fase A en B zijn gemerged.

Implementeer Fase C van PRD-12: notificaties en de milestone-reminder-scheduler.

1. Enum NotificationType (schema.prisma) uitbreiden met FASE_STATUS_GEWIJZIGD,
   MILESTONE_HERINNERING en MILESTONE_VERLOPEN. Migratie vanuit apps/api:
   npx prisma migrate dev --name add-phase-notification-types (NOOIT db push).

2. Dispatch bij statuswissel (project-phases.service.ts, update):
   - Bij een gewijzigde status: NotificationsService.dispatch() met type
     FASE_STATUS_GEWIJZIGD naar de projectmanager + interne fasevolgers (userId),
     creator uitgesloten; fire-and-forget zoals elders (fout → Logger.error,
     nooit de operatie blokkeren). Titel/body in het Nederlands, bijv.
     "Fase 'Verdieping Noord' is nu Actief" met project- en fasenaam.
   - Externe volgers (alleen e-mail, geen userId) krijgen uitsluitend bij een
     statuswissel een e-mail, via hetzelfde pad als de projectvolger-mails in
     projects.service.ts (§12.12.2). Milestone-notificaties zijn intern.

3. Nieuwe scheduler apps/api/src/modules/project-phases/project-phases.scheduler.ts,
   gemodelleerd naar measurement-instruments.scheduler.ts:
   - @Cron(CronExpression.EVERY_DAY_AT_6AM) → processDueMilestones(now: Date)
     (kern-logica als aparte methode, testbaar met vaste now).
   - Selecteer PhaseMilestone met status OPEN en dueDate <= now + reminderDaysBefore,
     waarbij de fase niet verwijderd is en het project status ACTIEF heeft.
     Let op: reminderDaysBefore is per milestone — filter in JS of met een raw query.
   - Stage: 'overdue' als dueDate < now, anders 'upcoming'. Dedupe via
     lastReminderStage/lastReminderAt (skip als de stage al verstuurd is);
     reset lastReminderStage in de service wanneer dueDate wijzigt of de status
     terug naar OPEN gaat.
   - Ontvangers: assignee + projectmanager + interne fasevolgers, gededupliceerd,
     gebatcht per org (zoals de kalibratie-scheduler org-admins batcht).
   - Type MILESTONE_HERINNERING (upcoming) resp. MILESTONE_VERLOPEN (overdue),
     entityType 'projectPhase', entityId = phaseId.

4. Registreer de scheduler als provider in project-phases.module.ts
   (ScheduleModule.forRoot() staat al in app.module.ts).

5. Tests (project-phases.scheduler.spec.ts, naar het voorbeeld van de
   kalibratie-schedulertests): stagebepaling rond de dueDate-grens, dedupe
   (tweede run zelfde stage → 0 notificaties), stage-overgang upcoming → overdue,
   ontvangers-deduplicatie, milestone op niet-actief project wordt overgeslagen.

Definition of done: npx turbo run build + pnpm test groen. Handmatige check:
zet in de seed een milestone met dueDate morgen, roep processDueMilestones aan
(tijdelijk via een testscript of unit test) en controleer de notificatie in de
portal-notificatielijst. Commit:
"feat: implement PRD-12 phase C — phase notifications & milestone scheduler".
```

### Prompt Fase D — Koppelintegratie

```text
Lees eerst CLAUDE.md volledig, en daarna het meegeleverde bestand PRD-12-PROJECTFASEN.md
(vooral §12.4.2–12.4.3 en §12.7.2). Fase A t/m C zijn gemerged; de API accepteert al
projectPhaseId op inspectieplannen, planregels, werkbonnen en offertes.

Implementeer Fase D van PRD-12: de fase-koppeling in alle relevante portal-schermen.

1. Herbruikbare fase-select: components/projects/phase-select.tsx —
   props projectId (nullable) + value + onChange; laadt fasen via
   useProjectPhases(projectId), disabled met hint zolang er geen project gekozen is,
   toont "Fase {n} — {naam}" met status-suffix, en een lege optie "Geen fase".

2. Koppel-plekken (steeds optioneel veld, patch met projectPhaseId of null):
   - link-entities-modal op de projectdetailpagina: extra fase-kolom/selectie
     zodat je bij het koppelen van een aanvraag/offerte/planregel direct een
     fase kiest.
   - Detailpagina's van offerte, planregel (planning), inspectieplan en werkbon:
     fase tonen als InfoField in de lees-modus (met link terug naar het project,
     tab Fasen) en de fase-select in de bewerk-modus. Volg het bestaande inline-
     editing-patroon; geen aparte instellingen-tab.
   - Wisselt de gebruiker het project op zo'n formulier, reset dan de fase-keuze.

3. Offerte-fallback-weergave (§12.4.3): in de uitgeklapte fasekaart (tab Fasen)
   toont de sectie Offertes de offertes met projectPhaseId = fase; zijn die er
   niet, toon dan de projectoffertes met een grijze badge "via project".

4. Overzichtstabellen: voeg een (standaard verborgen, via TableConfigSidebar
   aanzetbare) kolom "Fase" toe aan de overzichten van offertes, planning en
   inspectieplannen — ColumnDef met filterable: true, filterType 'select'.

5. Taken/documenten/notities op een fase: de DocumentsSection en taken-/notitie-
   componenten accepteren al een entityType — gebruik PROJECT_PHASE + phaseId in
   de uitgeklapte fasekaart (upload alleen voor canWrite-rollen). Voeg
   PROJECT_PHASE toe aan ENTITY_TYPE_LABELS in lib/status.ts ("Projectfase").

6. E2E/browser-smoketest: koppel in de demo-org een offerte en een planregel aan
   Fase 1, controleer de counts op de fasekaart, de fase-kolom in de overzichten
   en de fallback-badge op Fase 2 (die geen eigen offerte heeft).

Definition of done: npx turbo run build groen, unit- en portal-tests groen,
smoketest zoals hierboven. Commit:
"feat: implement PRD-12 phase D — phase linking across portal".
```

---
