# IMP PRD 16 — Urenregistratie & Locatietracking Inspecteurs (add-on)

> Status: **Concept ter review** · Auteur: Claude (Cowork) · Datum: 2026-08-27
> Taal: PRD in het Nederlands, feature-keys/code/branchnamen in het Engels (conform `CLAUDE.md`).
> Verwante docs: `IMP_PRD_09_SaaS-Abonnementen.md` (entitlements), `IMP_PRD_07_Planning.md` (planning/agenda), `IMP_PRD_12_Beschikbaarheid-Inspecteurs.md` (beschikbaarheid ≠ urenstaat), `INTEGRATIE-INSPEXI-APP.md` (PWA + sync).
> Branch: `claude/pwa-location-tracker-9xl8mv`.

---

## 0. Samenvatting

We bouwen een **urenregistratie voor inspecteurs** met een **weekstaat-goedkeuringsflow**, plus een **opt-in locatietracker** die (a) reistijd automatisch als urenregel start/stopt en (b) de backoffice tijdens het reizen een live kaartpositie van de inspecteur toont.

Kernbesluiten (vastgesteld met de opdrachtgever):

1. **Vijf activiteiten**: `VOORBEREIDING`, `UITVOERING`, `RAPPORTAGE`, `REISTIJD`, `OVERIG`. Projectkoppeling is **verplicht behalve bij `OVERIG`**.
2. **Alleen inspecteurs schrijven uren, via de PWA.** De portal is voor inzien, goedkeuren en corrigeren door de backoffice.
3. **Weekstaat + goedkeuring**: regels ontstaan als concept; de inspecteur dient per week in; een manager/projectmanager keurt goed of wijst af.
4. **Eén timer tegelijk per inspecteur.** Het starten van een nieuwe activiteit stopt de lopende timer automatisch (naadloze overgang reistijd → uitvoering).
5. **Vier startmechanismen** voor een timer: vanuit de **agenda** (planning-item in de PWA), **automatisch bij start van een inspectie**, **automatisch bij gedetecteerd vertrek** (reistijd), en **handmatig**.
6. **Reistijd = auto-timer, corrigeerbaar**: bij gedetecteerd vertrek start de reistijd-timer automatisch (met notificatie in de app), bij aankomst stopt hij; de inspecteur kan de regel achteraf corrigeren of verwijderen. Géén stille definitieve wegschrijving.
7. **Onderweg-tracker is een gebruikers-toggle** (aan/uit door de inspecteur zelf). Locatie is in de beheerconsole **alleen zichtbaar zolang de reistijd-timer loopt én de toggle aan staat** — met één klik van "wie is nu onderweg" naar een kaart met een duidelijke pin.
8. **Betaalde add-on**: nieuwe entitlement-key **`URENREGISTRATIE`** in de catalogus (`@inspexi/entitlements`), zoals `AI_REVIEW`/`ONLINE_HERSTEL`.
9. **Rapportage**: portal-overzicht met filters en totalen (basis voor goedkeuring), **Excel/CSV-export** van (goedgekeurde) uren, en een **uren-tab op de projectdetailpagina** voor nacalculatie.

**Belangrijkste technische randvoorwaarde (PWA):** browsers bieden **géén achtergrond-GPS**. `watchPosition` en de reisdetectie werken alleen zolang de PWA op de voorgrond staat (scherm aan, app actief). Dit PRD ontwerpt daaromheen (§6.5); continue tracking met scherm-uit vergt later een Capacitor-schil (expliciet **niet-doel**).

---

## 1. Doel & niet-doel

**Doel**
- Sluitende, laagdrempelige urenregistratie voor inspecteurs: zo veel mogelijk automatisch (agenda, inspectie-start, reisdetectie), altijd corrigeerbaar.
- De backoffice realtime inzicht geven in **welke activiteit elke inspecteur nu uitvoert** (welke timer loopt), en tijdens reizen de actuele positie op een kaart.
- Goedgekeurde uren als betrouwbare basis voor loonadministratie en projectnacalculatie (export + projecturen-tab).
- AVG-proportioneel: opt-in, doelgebonden, minimale bewaartermijn voor locatiedata.

**Niet-doel (dit PRD)**
- Achtergrond-tracking met scherm uit / app gesloten (vergt native schil; latere fase).
- Urenschrijven door stafrollen in de portal (backoffice kan wél regels van inspecteurs corrigeren/aanvullen bij de goedkeuring).
- Ritregistratie/kilometerregistratie voor de belastingdienst (geen routes, alleen reistijd + laatste positie).
- Tarieven/facturatie van uren (er is nog geen billing-systeem, zie `IMP_PRD_09` §8; het datamodel sluit een latere `hourlyRate`-uitbreiding niet uit).
- Koppeling met externe loonpakketten (export CSV/Excel is de brug).
- Integratie met de chat-presence-enum `Availability` of het PRD-12-beschikbaarheidsdomein — **volledig gescheiden domeinen**.

---

## 2. Bestaande infrastructuur die we hergebruiken

| Behoefte | Bestaand mechanisme | Pad |
|---|---|---|
| Feature-gating (add-on) | `@RequiresFeature(...)` + `FeatureGuard` + catalogus | `common/guards/feature.guard.ts`, `packages/entitlements/src/feature-catalog.ts` |
| Frontend feature-gate | `useFeatures().hasFeature()`, `<FeatureRoute>`, sidebar `feature?` | `apps/portal/src/providers/feature-provider.tsx` |
| Projecten & PM | `Project` (`projectManagerId`, `projectNumber`) | `schema.prisma` |
| Agenda van de inspecteur | `PlanningItem`/`PlanningSession` + `PlanningInspector`/`PlanningSessionInspector` (acceptatie) | `modules/planning` |
| Inspectie-uitvoering | `InspectionPlan` (`projectId`, `assignedTo`, `plannedDate`, **`gpsLatitude`/`gpsLongitude`**, adresvelden) | `schema.prisma` |
| Geocoding (adres → coördinaat) | `GeocodingService` (PDOK Locatieserver + BAG) | `modules/geocoding/geocoding.service.ts` |
| Offline-first PWA-datapad | `/sync` v3-contract (push/pull, Dexie in `../Inspexi-App`) | `modules/sync` |
| Multi-tenant & rollen | `TenantGuard`, `orgScope(user)`, `assertSameOrg`, `@Roles(...)` | `apps/api/src/common` |
| Race-vrije "max één actieve rij" | partial unique index-patroon (`imp_ai_review_runs_pending_plan_key`) | migraties PRD-13 |
| Notificaties | `NotificationType` + dispatch-patroon (fire-and-forget) | `modules/notifications` |
| Audit trail | `AUDITED_MODELS` + `writeAuditLog()` | `prisma/prisma.service.ts` |
| Lijst-/scope-helpers | `paginate()`, `buildOrderBy()`, `assertFound()` | `common/utils` |
| Portal-overzichtspatroon | `DetailPageLayout` + `TableConfigSidebar` + `useTableConfig` | `apps/portal/src/components` |

**Nieuw benodigd (niet aanwezig):** een kaart-library in de portal — de Konva-plattegrondviewer is hiervoor ongeschikt. Keuze: **MapLibre GL** of **Leaflet** met OpenStreetMap-tiles (geen API-key, geen kosten; tile-servergebruik conform OSM-policy, evt. later eigen tile-proxy). Aanbeveling: **Leaflet** (klein, simpel, één pin + één geofence-cirkel is alles wat we tonen).

---

## 3. Gebruikerservaring

### 3.1 PWA (inspecteur) — `../Inspexi-App` (aparte repo)

**Timerbalk (persistent).** Onderin de app een altijd zichtbare balk met de lopende timer: activiteit-icoon + label, projectnummer/-naam, verstreken tijd, stop-knop en "wissel activiteit". Geen lopende timer → knop "Start uren".

**Starten kan op vier manieren:**
1. **Vanuit de agenda**: op een planning-item/-sessie van vandaag staat een "Start"-knop → kiest activiteit (default `UITVOERING`, of `REISTIJD` vóór de starttijd) en neemt project + inspectieplan automatisch over uit het planning-item.
2. **Automatisch bij start inspectie**: zodra de inspecteur in de PWA een inspectieplan opent en de uitvoering start, start (of wisselt) de timer naar `UITVOERING` op het bijbehorende project. In-app melding: "Timer gestart: Uitvoering — P-2026-014". Uit te zetten per gebruiker (instelling "Automatisch starten bij inspectie").
3. **Automatisch bij vertrek (reisdetectie, §6)**: met de onderweg-tracker aan detecteert de app vertrek → start `REISTIJD`-timer + notificatie; aankomst bij de geplande locatie → stopt de timer (en wisselt naar `UITVOERING` als de auto-start-instelling aan staat).
4. **Handmatig**: activiteit kiezen (5 opties), project zoeken/kiezen (verplicht behalve `OVERIG`), optioneel notitie.

**Eén timer tegelijk.** Nieuwe start = lopende timer stoppen op hetzelfde moment (aansluitende regels, geen gat of overlap). De stop-reden (`gewisseld`, `handmatig`, `aankomst gedetecteerd`) komt in het regel-detail.

**Onderweg-tracker toggle.** Instelling in de PWA ("Reisdetectie & locatie delen"), default **uit**. Bij het aanzetten: uitleg wat er gedeeld wordt (alleen tijdens reistijd, laatste positie, geen routes), gevolgd door de browser-permissieprompt. Zolang de tracker actief locatie deelt toont de app permanent een indicator ("📍 locatie wordt gedeeld").

**Weekstaat.** Scherm "Mijn uren": per week een lijst van regels (per dag gegroepeerd, totalen per activiteit), regels bewerken/verwijderen/toevoegen zolang de week `CONCEPT` is, knop **"Week indienen"**. Na indienen read-only; bij afwijzing (met opmerking van de beoordelaar) terug naar bewerkbaar. Offline werkt alles (Dexie), sync bij verbinding.

### 3.2 Portal (backoffice)

**"Nu actief"-overzicht.** Nieuwe pagina **Uren → Live** (en een compact dashboard-widget): per inspecteur de lopende timer — activiteit-badge, project, starttijd, duur. Bij een lopende `REISTIJD`-timer mét actieve tracker: knop **"Toon op kaart"** → modal met Leaflet-kaart, één duidelijke pin (initialen-avatar van de inspecteur) op de laatst ontvangen positie + timestamp ("2 min geleden") en de bestemming (geofence-cirkel om de geplande locatie). Auto-refresh via polling (30 s). Geen tracker/geen reistijd → geen kaartknop, alleen de timer-informatie.

**Uren → Weekstaten.** Overzicht van ingediende weekstaten (filters: week, inspecteur, status, project, activiteit; kolommen met totalen; `TableConfigSidebar`-patroon). Detail: alle regels van de week, per dag, met bron-badge (handmatig/agenda/auto-inspectie/auto-reis) en gecorrigeerd-indicator. Acties: **Goedkeuren** / **Afwijzen met opmerking** / **regel corrigeren** (duur/activiteit/project aanpassen — gelogd in audit trail, origineel blijft zichtbaar). Export-knop **CSV/Excel** op het overzicht (respecteert filters; kolommen: inspecteur, datum, activiteit, project, start, eind, duur, status, bron).

**Projectdetail → tab "Uren".** Totalen per activiteit + per inspecteur, en de onderliggende (goedgekeurde én concept-) regels, voor nacalculatie.

**Rechten.**
- `INSPECTEUR`: alleen eigen regels/weekstaten (PWA); geen toegang tot de portal-urenpagina's.
- Goedkeuren: `MANAGER`, `ORG_ADMIN` (en `SUPERUSER`); een `Project.projectManagerId` met rol `WERKVOORBEREIDER`/`BACKOFFICE` mag weekstaten **inzien** maar niet goedkeuren (simpel houden; per-org verfijning later).
- Live-overzicht + kaart: alle stafrollen behalve `INSPECTEUR` (zelfde groep als planning).

---

## 4. Datamodel (Prisma, prefix `imp_`)

### 4.1 Enums

```prisma
enum TimeActivityType {
  VOORBEREIDING
  UITVOERING
  RAPPORTAGE
  REISTIJD
  OVERIG
}

enum TimeEntrySource {
  HANDMATIG        // handmatig gestart of aangemaakt
  AGENDA           // gestart vanaf een planning-item in de PWA
  INSPECTIE_AUTO   // auto-gestart bij openen/starten van een inspectie
  REIS_AUTO        // auto-gestart door reisdetectie
  CORRECTIE        // door backoffice toegevoegd/gecorrigeerd in de portal
}

enum TimesheetStatus {
  CONCEPT
  INGEDIEND
  GOEDGEKEURD
  AFGEWEZEN
}
```

### 4.2 Modellen (3 nieuw + 1 uitbreiding)

```prisma
model TimeEntry {
  id               String            @id @default(uuid()) @db.Uuid
  orgId            String            @map("org_id") @db.Uuid
  userId           String            @map("user_id") @db.Uuid          // de inspecteur
  activityType     TimeActivityType  @map("activity_type")
  source           TimeEntrySource   @default(HANDMATIG)
  projectId        String?           @map("project_id") @db.Uuid      // verplicht behalve OVERIG (service-validatie)
  inspectionPlanId String?           @map("inspection_plan_id") @db.Uuid
  planningItemId   String?           @map("planning_item_id") @db.Uuid
  startedAt        DateTime          @map("started_at")
  endedAt          DateTime?         @map("ended_at")                  // null = lopende timer
  durationMinutes  Int?              @map("duration_minutes")          // gezet bij stop; corrigeerbaar
  notes            String?
  stopReason       String?           @map("stop_reason")               // 'gewisseld' | 'handmatig' | 'aankomst' | 'nachtwaker'
  correctedById    String?           @map("corrected_by_id") @db.Uuid  // staf-correctie (audit toont diff)
  timesheetId      String?           @map("timesheet_id") @db.Uuid
  isDeleted        Boolean           @default(false) @map("is_deleted")
  clientId         String?           @map("client_id")                 // PWA offline-id (idempotente sync-push)
  createdAt        DateTime          @default(now()) @map("created_at")
  updatedAt        DateTime          @updatedAt @map("updated_at")

  // relations: organization, user, project?, inspectionPlan?, planningItem?, timesheet?
  @@unique([orgId, clientId])
  @@index([orgId, userId, startedAt])
  @@index([orgId, projectId])
  @@index([timesheetId])
  @@map("imp_time_entries")
}

model Timesheet {
  id            String          @id @default(uuid()) @db.Uuid
  orgId         String          @map("org_id") @db.Uuid
  userId        String          @map("user_id") @db.Uuid
  year          Int
  weekNumber    Int             @map("week_number")                    // ISO-week
  status        TimesheetStatus @default(CONCEPT)
  submittedAt   DateTime?       @map("submitted_at")
  reviewedById  String?         @map("reviewed_by_id") @db.Uuid
  reviewedAt    DateTime?       @map("reviewed_at")
  reviewNote    String?         @map("review_note")                    // verplicht bij AFGEWEZEN
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")

  @@unique([orgId, userId, year, weekNumber])
  @@index([orgId, status])
  @@map("imp_timesheets")
}

model InspectorLocationPing {
  id          String   @id @default(uuid()) @db.Uuid
  orgId       String   @map("org_id") @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  timeEntryId String?  @map("time_entry_id") @db.Uuid   // de lopende REISTIJD-regel
  latitude    Decimal  @db.Decimal(10, 8)
  longitude   Decimal  @db.Decimal(11, 8)
  accuracyM   Int?     @map("accuracy_m")
  recordedAt  DateTime @map("recorded_at")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([orgId, userId, recordedAt])
  @@map("imp_inspector_location_pings")
}
```

**Uitbreiding `User`:** `travelTrackingEnabled Boolean @default(false)` + `travelTrackingConsentAt DateTime?` — server-side vastlegging van de opt-in (de PWA-toggle schrijft dit weg; de portal toont het, wijzigt het nooit namens de gebruiker).

### 4.3 Invarianten & indexen buiten het Prisma-schema

- **Max één lopende timer per gebruiker**, race-vrij afgedwongen met een **partial unique index** (zelfde patroon als PRD-13):
  `CREATE UNIQUE INDEX imp_time_entries_running_user_key ON imp_time_entries(user_id) WHERE ended_at IS NULL AND is_deleted = false;`
  P2002 bij start → service stopt eerst de lopende timer en probeert opnieuw (of geeft 409 met de lopende timer in de body).
  ⚠️ Net als de ltree-GIST- en AI-review-index: **`DROP INDEX`-regels die `migrate dev` genereert handmatig uit nieuwe migraties strippen.**
- **`durationMinutes`-consistentie**: bij stop berekend uit `endedAt − startedAt`; een staf-correctie mag de duur aanpassen (dan wijkt hij bewust af — de audit-diff is de verantwoording).
- **Projectregel**: `projectId` verplicht tenzij `activityType = OVERIG` (class-validator + service-check, ook in de sync-push). FK's altijd via `assertSameOrg`/`assertAllSameOrg`.
- **Weekstaat-lock**: regels muteren kan alleen zolang de bijbehorende weekstaat `CONCEPT` of `AFGEWEZEN` is; `INGEDIEND`/`GOEDGEKEURD` → 409 (staf-correcties via het portal-pad mogen wél op `INGEDIEND`, nooit op `GOEDGEKEURD`).
- **Ping-retentie 48 uur**: dagelijkse cleanup (cron/`@nestjs/schedule`) verwijdert pings ouder dan 48 u. Alleen de **laatste** ping per gebruiker wordt getoond; er is bewust géén route-weergave.
- **Nachtwaker**: een timer die om 23:59 lokaal nog loopt wordt server-side gestopt (`stopReason: 'nachtwaker'`, notificatie naar de inspecteur) — voorkomt 40-uursregels door een vergeten stop.

### 4.4 Seed & opruimvolgorde

`prisma/seed.ts` opruimen (kinderen eerst), **vóór** `user`/`organization` en vóór `project`/`inspectionPlan`/`planningItem`:

```
inspectorLocationPing → timeEntry → timesheet
```

Bij `SEED_DEMO=1`: demo-org krijgt een `URENREGISTRATIE`-override; de demo-inspecteur `travelTrackingEnabled = true`, één weekstaat `INGEDIEND` (vorige week, mix van alle 5 activiteiten op het demo-project), één weekstaat `CONCEPT` (deze week) en één **lopende** `REISTIJD`-timer + 3 recente pings richting "Kantoorpand Zuidas" zodat de kaart direct demo-baar is.

---

## 5. API (module `time-tracking`)

Alle routes `@RequiresFeature('URENREGISTRATIE')`; org-scoped; audit trail aan voor `TimeEntry` en `Timesheet` (opnemen in `AUDITED_MODELS`, FK-resolvers voor `projectId`/`userId`/`reviewedById`).

| Endpoint | Rol | Beschrijving |
|---|---|---|
| `POST /time-entries/start` | INSPECTEUR | Start timer `{activityType, projectId?, inspectionPlanId?, planningItemId?, source}`; stopt lopende timer atomisch (zelfde transactie); 201 met nieuwe + gestopte regel |
| `POST /time-entries/stop` | INSPECTEUR | Stopt de eigen lopende timer; 404 als er geen loopt |
| `GET /time-entries` | staf; INSPECTEUR alleen eigen | Gepagineerd (basiscap 200 → opnemen in `pagination-limit.e2e-spec.ts`); filters `userId`, `projectId`, `activityType`, `from`, `to`, `status` |
| `POST /time-entries` / `PATCH /time-entries/:id` / `DELETE` | INSPECTEUR (eigen, week open); staf-correctie via PATCH (`source: CORRECTIE`) | Handmatige regel / correctie / soft-delete |
| `GET /time-tracking/active` | staf (niet INSPECTEUR) | Lopende timers per inspecteur incl. `hasLiveLocation` (tracker aan + REISTIJD + ping < 5 min) |
| `POST /time-tracking/pings` | INSPECTEUR | Batch pings `[{latitude, longitude, accuracyM, recordedAt}]`; alleen geaccepteerd als er een eigen lopende `REISTIJD`-timer is én `travelTrackingEnabled`; anders 204-noop (geen error-spam in de app). Throttle 30/min |
| `GET /time-tracking/locations/:userId/latest` | staf | Laatste ping (< 30 min) + bestemming (coördinaat/adres van het gekoppelde planning-item of inspectieplan); anders 404 |
| `GET /timesheets` / `GET /timesheets/:id` | staf; INSPECTEUR eigen | Weekstaten incl. totalen per activiteit |
| `POST /timesheets/:id/submit` | INSPECTEUR (eigen) | `CONCEPT`/`AFGEWEZEN` → `INGEDIEND`; weigert bij lopende timer in die week |
| `POST /timesheets/:id/approve` · `POST /timesheets/:id/reject` | MANAGER / ORG_ADMIN | Goedkeuren resp. afwijzen (opmerking verplicht) |
| `GET /timesheets/export` | staf | CSV-export (zelfde filters als `GET /time-entries`; Excel-compatibel, `;`-separator, nl-NL) |
| `PATCH /users/me/travel-tracking` | INSPECTEUR | Toggle `{enabled}` → zet `travelTrackingEnabled` + `travelTrackingConsentAt` |

**Weekstaat-materialisatie:** de `Timesheet`-rij wordt lazy aangemaakt (eerste regel in die ISO-week → upsert op `@@unique([orgId, userId, year, weekNumber])`); regels krijgen `timesheetId` bij aanmaak op basis van `startedAt`.

**Notificaties** (groep nieuw: `UREN`): `WEEKSTAAT_INGEDIEND` → goedkeurders; `WEEKSTAAT_GOEDGEKEURD` / `WEEKSTAAT_AFGEWEZEN` → inspecteur; `TIMER_NACHTWAKER` → inspecteur.

**Sync (PWA offline-first):** timer-acties gaan primair via de REST-endpoints (realtime karakter). Offline gestarte/gestopte regels bufferen in Dexie en gaan mee in de **`/sync` v3-push** als nieuwe entiteit `timeEntries` (idempotent op `clientId`, zelfde patroon als de overige uitvoeringsentiteiten; de server hervalideert projectregel + weekstaat-lock). **Pings worden nooit gebufferd** — offline betekent gewoon geen live-positie (bewuste privacy- en batterijkeuze).

---

## 6. Reisdetectie & locatietracking (PWA)

### 6.1 Toggle & permissies

- Instelling per gebruiker, default **uit**; aanzetten → uitlegscherm → `geolocation`-permissie → `PATCH /users/me/travel-tracking`.
- Staat de toggle uit, dan bestaat er géén reisdetectie en géén ping — reistijd is dan puur handmatig/vanuit agenda.

### 6.2 Detectie-algoritme (heuristisch, bewust simpel in fase 1)

Met de tracker aan draait in de actieve PWA een `watchPosition`-loop (throttled, `enableHighAccuracy: false` voor batterij):

- **Vertrek**: ≥ 500 m verplaatsing t.o.v. het laatste rustpunt binnen 5 minuten, óf 2 opeenvolgende metingen met snelheid > 20 km/u → start `REISTIJD`-timer (`source: REIS_AUTO`, `startedAt` = eerste bewegingsmeting) + in-app notificatie **"Reistijd gestart — tik om te corrigeren"**. Project/planning wordt afgeleid van het **eerstvolgende geplande item van vandaag** (agenda); zonder planning-item vandaag start er níéts automatisch (handmatig blijft mogelijk).
- **Aankomst**: binnen **200 m geofence** van de bestemming (coördinaat: `InspectionPlan.gpsLatitude/gpsLongitude`, anders on-demand geocoding van het locatie-adres via de bestaande PDOK-`GeocodingService`, server-side gecachet op de `Location`), óf > 5 min stilstand → stop `REISTIJD` (+ auto-start `UITVOERING` als die instelling aan staat).
- **Pings**: alleen zolang de `REISTIJD`-timer loopt, elke 60 s of ≥ 250 m, gebatcht naar `POST /time-tracking/pings`.

### 6.3 Correctie is eersteklas

Elke `REIS_AUTO`-regel toont in de weekstaat een badge "automatisch"; tikken → duur/start/eind aanpassen of regel verwijderen. Dit is het vangnet voor alle heuristiek-fouten (file, lunchstop, omweg) — vandaar geen bevestigingsdrempel vooraf, maar volledige corrigeerbaarheid achteraf.

### 6.4 Kaartweergave (portal)

Leaflet + OSM-tiles; modal vanuit "Nu actief". Toont: pin (initialen-avatar, org-kleur) op de laatste ping, timestamp-chip, bestemmings-marker + 200 m-cirkel, knop "Vernieuwen" (naast 30 s-polling). Geen historische route, geen multi-inspecteur-kaart in fase 1.

### 6.5 PWA-beperkingen — expliciet gedocumenteerd gedrag

| Situatie | Gedrag |
|---|---|
| App op voorgrond, scherm aan | Detectie + pings werken volledig |
| Scherm vergrendeld / app in achtergrond | GPS stopt (browserbeperking). Bij terugkeer naar de app: inhaal-logica — was er een lopende `REISTIJD`-timer, dan loopt die gewoon door (server-side klok); de app hertoetst direct de geofence en stopt de timer met terugwerkende kracht als de bestemming al bereikt is |
| iOS/Safari | Zelfde als hierboven; extra: permissie kan per sessie opnieuw gevraagd worden — de app vraagt stil opnieuw bij activatie |
| Langdurig geen pings (> 30 min) bij lopende reistimer | Kaartknop verdwijnt in de portal ("positie verouderd"); timer loopt door |

In de praktijk: de reistijd-**registratie** (start/stop met terugwerkende geofence-check) is robuust genoeg; de **live kaart** is best-effort en werkt vooral wanneer de telefoon met scherm aan in de houder staat (navigatie-scenario). Dit staat zo in de release-notes/gebruikersuitleg. Volwaardige achtergrondtracking = Capacitor-traject, buiten scope.

---

## 7. Privacy & AVG

- **Doelbinding**: locatiedata dient uitsluitend reistijd-registratie + actuele positie tijdens reizen; vastgelegd in de verwerkingsdocumentatie van de org (template meeleveren in de release-notes).
- **Opt-in per inspecteur** met vastgelegd consent-moment (`travelTrackingConsentAt`); geen org-brede aan-knop die individuele toggles overschrijft. De werkgever moet daarnaast zelf **OR-instemming (art. 27 WOR)** regelen — de add-on-onboarding wijst daar expliciet op.
- **Dataminimalisatie**: alleen pings tijdens `REISTIJD`; retentie **48 uur**; alleen laatste positie zichtbaar; geen routes, geen snelheid opgeslagen, geen tracking buiten timers.
- **Transparantie**: permanente indicator in de PWA zodra er gedeeld wordt; de inspecteur ziet in "Mijn uren" precies welke regels automatisch zijn ontstaan.
- **Toegang**: kaart/live-overzicht alleen voor stafrollen; pings vallen buiten de audit-FK-resolvers (geen verrijking nodig) maar leesacties op de kaart-endpoint kunnen desgewenst gelogd worden (fase 4-optie).

---

## 8. Entitlements & instellingen

- Catalogus (`packages/entitlements/src/feature-catalog.ts`): nieuwe add-on **`URENREGISTRATIE`** ("Urenregistratie & reistijd"). Alle `/time-entries`-, `/timesheets`- en `/time-tracking`-routes dragen `@RequiresFeature('URENREGISTRATIE')`; sidebar-items en de PWA-feature-probe gaan via de bestaande feature-flags (PWA leest features al via de branding/feature-payload).
- **Geen aparte org-toggle voor de tracker** in fase 1: de gebruikers-opt-in ís de poort. (Een org-brede kill-switch `Organization.travelTrackingEnabled` is een kleine latere toevoeging als een klant tracking contractueel wil uitsluiten — genoteerd als open punt §11.)

---

## 9. Fasering

| Fase | Inhoud | Oplevering |
|---|---|---|
| **F1 — Urenstaat-kern (API + portal)** | Modellen + migratie (incl. partial index), `time-tracking`-module (entries/timesheets/export), audit + notificaties, portal: weekstaten-overzicht + detail + goedkeuring + projecturen-tab, seed, unit + e2e (incl. `pagination-limit`) | Backoffice kan uren zien/goedkeuren/exporteren; regels via API |
| **F2 — PWA-timers** | Timerbalk, handmatig/agenda/inspectie-auto starten, weekstaat-scherm + indienen, Dexie-buffer + `/sync` `timeEntries`-push, nachtwaker | Inspecteurs schrijven uren volledig vanuit de PWA |
| **F3 — Reisdetectie + kaart** | Toggle + consent, detectie-loop, pings-endpoint + retentie-cron, geocoding-cache op `Location`, portal "Nu actief" + Leaflet-kaartmodal | Automatische reistijd + live pin |
| **F4 — Polish** | Excel-export verfijning, dashboard-widget, org-kill-switch (indien gewenst), kaart-toegangslogging | Afronding |

F1 en F2 leveren los van elkaar waarde; F3 is pas zinvol ná F2. Het PWA-werk (F2/F3 client-zijde) landt in de **`Inspexi-App`-repo** — dit PRD specificeert het contract, de implementatie daar krijgt een eigen briefing-doc (patroon: `MEETMIDDELEN-PWA-PROMPT.md`).

---

## 10. Testplan (hoofdlijnen)

- **Unit (API)**: timer-startlogica (atomisch wisselen, P2002-pad van de partial index), projectregel-validatie (`OVERIG` zonder project OK, rest 400), weekstaat-lock (mutatie op `INGEDIEND` → 409), nachtwaker, ping-guard (geen reistimer/toggle uit → 204-noop), ISO-weeknummering (jaarwissel week 52/53/1), exportformattering.
- **E2E**: volledige flow start→wissel→stop→indienen→afwijzen→corrigeren→goedkeuren; cross-tenant FK-injectie (project/planning/inspectieplan van org B → 403, uitbreiden in `cross-tenant.e2e-spec.ts`); rolgrenzen (INSPECTEUR kan andermans regels niet lezen, niet goedkeuren); nieuw gepagineerd endpoint in `pagination-limit.e2e-spec.ts`.
- **Portal (Vitest)**: weekstaat-detail rendering, statusbadges, exportknop.
- **Handmatig/browser**: kaartmodal met seed-pings; PWA-scenario's uit §6.5 op een fysiek toestel (iOS Safari + Android Chrome).

---

## 11. Open punten (bewust buiten dit PRD besloten of doorgeschoven)

1. **Pauzeknop**: fase 1 lost dit op met stop + opnieuw starten; een expliciete pauze-status kan later.
2. **Uurtarieven/facturatie** van geschreven uren — wacht op het billing-spoor (`IMP_PRD_09` §8).
3. **Org-brede tracker-kill-switch** (`Organization.travelTrackingEnabled`) — toevoegen zodra een klant erom vraagt (klein).
4. **Capacitor-schil** voor echte achtergrondtracking — apart traject met eigen PRD als de foreground-beperking in de praktijk knelt.
5. **Goedkeuren door projectmanagers** met rol `WERKVOORBEREIDER`/`BACKOFFICE` — nu bewust beperkt tot `MANAGER`+; heroverwegen na eerste gebruiksfeedback.
6. **Multi-inspecteur-kaart** (alle reizende inspecteurs op één kaart) — fase 4+-kandidaat.
