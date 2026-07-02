# Implementatie-prompt PWA (`Inspexi-App`) — Meetmiddelen in de meetstaat

Draai deze prompt in **Claude Code, in de root van de `Inspexi-App`-repo** (de inspecteur-PWA: React, Dexie/IndexedDB, offline-first).

Dit is **prompt 2 van 2**:

- **Prompt 1 — backend + portal:** `MEETMIDDELEN-IMPLEMENTATIE-PROMPT.md` in de `InspeXi-Beheer`-repo. Levert het server-side sync-contract.
- **Prompt 2 — PWA:** deze prompt. Sluit aan op dat contract.

**Volgorde:** het server-contract (zie hoofdstuk 3) hoort idealiter eerst te bestaan. Tot dan code je **defensief** — optionele velden en lege-array fallbacks — zodat de bestaande sync blijft werken.

**Vóór je begint:** lees `CLAUDE.md` / `README` / `docs/` van deze repo en verken de codebase. Volg de bestaande conventies. Code, commits en branchnamen in het **Engels**; UI-labels in het **Nederlands**.

---

## 1. Opdracht in het kort

Maak meetmiddelen (measurement instruments) **read-only** beschikbaar in de PWA en laat de inspecteur per **meetstaat** kiezen welke meetmiddelen gebruikt zijn. De selectie wordt voorinvuld via een twee-niveau voorkeur-cascade (inspectie → inspecteur), offline opgeslagen in Dexie en via het bestaande v2 sync-contract naar de server gepusht. Bij elk meetmiddel toon je een kalibratie-statusbadge. **Geen** beheer van meetmiddelen of kalibraties in de PWA.

---

## 2. Scope (door de gebruiker bevestigd)

- **Alleen selecteren.** Meetmiddelen en voorkeuren komen **read-only** uit `/sync`. Aanmaken, bewerken en verwijderen van meetmiddelen + kalibraties blijft in de portal.
- **Per meetstaat** kiest de inspecteur de gebruikte meetmiddelen. Dit wordt opgeslagen als `usedInstrumentIds: string[]` op de meetstaat-record en mee-gepusht via sync.
- **Twee-niveau voorkeur (pre-fill cascade)** bij het openen van een nog lege meetstaat:
  1. inspectie-voorkeur (`inspectionPlan.defaultInstrumentIds`) als die bestaat, anders
  2. inspecteur-voorkeur (globale default van de ingelogde inspecteur).

  Na voorinvulling kan de inspecteur de selectie handmatig aanpassen.
- **Kalibratie-statusbadge** overal waar een meetmiddel verschijnt: `geldig` / `verloopt binnenkort` / `verlopen` / `geen kalibratie`. Berekend uit `lastCalibrationDate + calibrationIntervalMonths`, met een instelbare drempel (default 30 dagen). **Geen** harde blokkade bij verlopen meetmiddelen.
- **Offline-first.** Alles werkt zonder netwerk; de UI leest uit Dexie. Verwijderde meetmiddelen verdwijnen via tombstones (`deletedIds`).

---

## 3. Server-contract waarop je aansluit

De backend breidt het v2 sync-contract als volgt uit. Implementeer de PWA-kant hier exact op. Code defensief zolang een veld nog niet in de pull-response zit.

### 3.1 Pull-response (`GET /sync/pull`) — toevoegingen

**`measurementInstruments`** — read-only referentielijst (org-scoped). Per item:

```ts
interface MeasurementInstrumentWire {
  id: string;
  orgId: string;
  code: string;                      // uniek nummer
  brand: string;                     // merk
  type: string;
  serialNumber?: string | null;      // serienummer
  status: 'ACTIEF' | 'BUITEN_GEBRUIK' | 'AFGEKEURD';
  assignedToUserId?: string | null;  // null = op voorraad
  calibrationIntervalMonths: number; // bv. 12
  lastCalibrationDate?: string | null; // ISO; door server afgeleid uit kalibraties
  nextCalibrationDue?: string | null;  // ISO; = laatste kalibratie + interval
}
```

**`deletedIds.measurementInstruments: string[]`** — tombstones om lokaal te verwijderen.

**Voorkeuren** (read-only voor de PWA):

- `userDefaultInstrumentIds: string[]` — globale voorkeur van de ingelogde gebruiker (op het pull-payload of het `me`/profiel-object dat de PWA al pullt; gebruik wat de backend levert en documenteer welke).
- `defaultInstrumentIds: string[]` — per-inspectie voorkeur, als veld op elk gepulde `inspectionPlan`-object.

### 3.2 Meetstaat-record push — `usedInstrumentIds`

> **Let op — afwijking t.o.v. de generieke `/sync/push`.** Meetstaat-records (measurement sheet records) lopen in de Beheer-backend **niet** via `/sync/push` (de sync-entiteiten zijn alleen `inspectionPlans`/`assets`/`findings`). Ze worden gepersisteerd via de eigen REST-endpoints `POST /measurement-sheet-records` en `PATCH /measurement-sheet-records/:id` (met de `x-device-id`-header) — dezelfde weg die de PWA nu al gebruikt om een meetstaat naar de server te schrijven.

De meetstaat-record draagt nu het scalar-array-veld `usedInstrumentIds: string[]`. Voeg dit toe aan de lokale record én aan de create/update-payload naar `/measurement-sheet-records`. De server accepteert en valideert het veld (org-scope op de meetmiddel-ids) en bewaart bij elke schrijf een snapshot van de meetmiddel-details voor documenthistorie. Stuur het mee bij elke create/update van een meetstaat-record vanuit de PWA.

Kalibraties worden **niet** naar de PWA gesynct. De PWA toont alleen de afgeleide status uit `lastCalibrationDate` / `nextCalibrationDue`.

---

## 4. Verken eerst dit in de PWA-codebase (read-only)

1. **Dexie-database** — het bestand met de DB-definitie en het huidige **versienummer (v9)**: alle stores + indexes, de TS-interfaces per store, en hoe een eerdere versie-bump/migratie is gedaan (`.version(n).stores({...}).upgrade(...)`). Dit is je patroon voor de nieuwe store.
2. **Sync-engine (client)** — waar de pull binnenkomt en in Dexie wordt weggeschreven (incl. toepassen van `deletedIds`), en waar de push lokale wijzigingen verzamelt en verstuurt. Vind de TS-types die het server-contract spiegelen.
3. **Read-only referentiedata** — hoe bestaande gepulde lijsten (zoals `contacts` en/of `users`) worden opgeslagen en geconsumeerd. Spiegel exact dit patroon voor `measurementInstruments`.
4. **Meetstaat-UI** — het scherm/formulier waar de inspecteur een meetstaat invult: hoe de record (`data`-JSON + velden) lokaal wordt bewerkt/opgeslagen, en hoe de record aan een `asset` + `inspectionPlan` hangt.
5. **Gedeelde helpers & UI** — date/format-helpers, een status-badge component, en een multi-select (of bouw er één als die ontbreekt).
6. **Gebruiker & inspectie-context** — hoe de ingelogde inspecteur lokaal bekend is, en hoe per-inspectie data lokaal staat. Nodig voor de voorkeur-cascade.
7. **Build/test/lint** — scripts in `package.json` en de branch-conventie (de backend noemt een bestaande sync-branch `feat/pwa-v2-sync-contract`).

---

## 5. Implementatie

### 5.1 Dexie-schema (v9 → v10)

- Bump de DB-versie naar **v10** en voeg een read-only store `measurementInstruments` toe.
- Suggestie-indexen: `id` (primary), `assignedToUserId`, `nextCalibrationDue`, `status`. Pas aan op de conventie van bestaande stores.
- Voeg de TS-interface toe (spiegelt 3.1; gebruik `Date` of ISO-string zoals de codebase elders datums opslaat).
- Bewaar de voorkeuren lokaal zoals de codebase referentiedata/instellingen bewaart: de globale default-IDs van de inspecteur (settings/meta-store of bij de user-record) en de per-inspectie `defaultInstrumentIds` op de lokale `inspectionPlan`-record.
- Migratie: nieuwe lege store voor bestaande gebruikers; data vult zich bij de eerstvolgende pull. Volg de bestaande `.upgrade()`-aanpak; geen data-kopie nodig.

### 5.2 Sync-engine (client)

- **Pull:** upsert `measurementInstruments` in Dexie; pas `deletedIds.measurementInstruments` toe (lokaal verwijderen). Sla `userDefaultInstrumentIds` en de per-`inspectionPlan` `defaultInstrumentIds` op.
- **Push:** neem `usedInstrumentIds` mee in de change-payload van meetstaat-records. Markeer een gewijzigde selectie als "dirty / needs-push" volgens het bestaande mechanisme.
- **Conflicten:** meetmiddelen zijn read-only → server-wins; geen merge-UI nodig.

### 5.3 Kalibratie-status helper

Maak één gedeelde helper, bv. `getCalibrationStatus(instrument, warnDays = 30)` die teruggeeft: `'GEEN_KALIBRATIE' | 'GELDIG' | 'BINNENKORT' | 'VERLOPEN'`.

- geen `lastCalibrationDate` → `GEEN_KALIBRATIE`
- `nextCalibrationDue < vandaag` → `VERLOPEN`
- `vandaag ≤ nextCalibrationDue ≤ vandaag + warnDays` → `BINNENKORT`
- anders → `GELDIG`

Gebruik dezelfde drempel/logica als backend en portal (houd `warnDays` configureerbaar, default 30). Render via het bestaande badge-component met NL-labels: Geldig / Verloopt binnenkort / Verlopen / Geen kalibratie (groen / geel / rood / grijs).

### 5.4 Meetstaat-UI: "Gebruikte meetmiddelen"

- Voeg in het meetstaat-formulier een multi-select "Gebruikte meetmiddelen" toe.
  - Opties = de lokale `measurementInstruments`. Toon per optie `code — merk type` + statusbadge; maak onderscheid tussen "Op voorraad" en toegewezen en sorteer logisch (bv. eigen toegewezen bovenaan).
  - Waarde ↔ `record.usedInstrumentIds`.
- **Pre-fill cascade** bij het openen van een meetstaat zónder bestaande `usedInstrumentIds`:
  1. `inspectionPlan.defaultInstrumentIds` indien niet leeg, anders
  2. `userDefaultInstrumentIds`.

  Bestaat de record al mét `usedInstrumentIds`? Dan die respecteren, niet overschrijven.
- Filter ID's die lokaal niet (meer) bestaan netjes weg, maar verlies geen geldige selecties.
- Opslaan schrijft naar Dexie en markeert de record voor push.

### 5.5 Weergave & robuustheid

- Toon de statusbadge ook in overzichten/detail waar een geselecteerd meetmiddel verschijnt.
- Geen netwerk-afhankelijkheid in de UI-flow: alles leest uit Dexie.
- Nette lege staat (nog geen meetmiddelen gesynct) met een NL-melding.

---

## 6. Tests, build & oplevering

- **Unit:** `getCalibrationStatus` (alle vier de takken + grensgevallen rond de drempel), de pre-fill-cascade (inspectie-default wint van inspecteur-default; bestaande selectie blijft behouden), en de sync-upsert + tombstone-verwijdering van `measurementInstruments`.
- **Component/e2e (indien aanwezig):** meetstaat openen → cascade-voorinvulling → selectie wijzigen → opslaan → record gemarkeerd voor push met `usedInstrumentIds`.
- **Type-check, lint en build** groen (scripts uit `package.json`).
- **Dexie-migratie** verifiëren: upgrade v9 → v10 zonder dataverlies; nieuwe store wordt na een pull gevuld.
- Werk de PWA-`docs` / `CLAUDE.md` bij met de nieuwe store + sync-velden.
- **Branch** volgens repo-conventie (bv. `feat/pwa-measurement-instruments`); commits in het Engels met `Co-Authored-By Claude`.

---

## 7. Coördinatie met de backend

- De PWA hangt af van de contract-uitbreidingen uit hoofdstuk 3 (pull-velden + push-whitelist). Stem af dat prompt 1 (`MEETMIDDELEN-IMPLEMENTATIE-PROMPT.md`) deze levert; idealiter eerst of parallel.
- Tot de server live is: code defensief (optionele velden, lege-array fallbacks). De PWA mag nooit crashen als `measurementInstruments` of `defaultInstrumentIds` nog ontbreken in de pull-response.
- Verifieer de exacte veldnamen en payload-vorm tegen de echte backend-implementatie (`apps/api/src/modules/sync/sync.service.ts` + `sync-mapper.ts` + `sync/dto`) vóór je de types vastlegt.

---

## 8. Definition of done (PWA)

1. Dexie v10 met read-only store `measurementInstruments`; v9 → v10 migreert zonder dataverlies.
2. Sync pullt meetmiddelen + beide voorkeur-niveaus en past tombstones toe; push stuurt `usedInstrumentIds` mee op meetstaat-records.
3. Meetstaat heeft een werkende "Gebruikte meetmiddelen"-multiselect met correcte pre-fill-cascade (inspectie → inspecteur), die bestaande selecties respecteert.
4. Kalibratie-statusbadge (geldig / binnenkort / verlopen / geen) klopt overal, met de gedeelde drempel.
5. Volledig offline bruikbaar; geen crash bij ontbrekende contract-velden.
6. Type-check, lint, build en tests groen; Dexie-migratie geverifieerd.
