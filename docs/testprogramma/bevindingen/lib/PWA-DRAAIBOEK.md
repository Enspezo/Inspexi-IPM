# PWA-draaiboek (voor het INS-script)

Vooronderzoek in `/Users/mathijs/VIBE/Inspexi-App-test/apps/inspectie-app/`. Alle paden hieronder
zijn relatief aan die map. Gebruik dit als startpunt — **verifieer elke bewering in de draaiende app**.

## Routes (react-router, gewone URL-navigatie werkt)

| Route | Scherm |
|---|---|
| `/login` | Login (publiek) |
| `/dashboard` | Dashboard |
| `/inspections` | Inspectielijst |
| `/inspections/:planId` | Plan-detail (tabs Assets / Documenten) |
| `/inspections/:planId/complete` | Afrond-wizard (opent altijd op stap "assets") |
| `/inspections/:planId/assets/:assetId` | Asset-detail (tabs Overzicht/Visueel/Meetstaat/Constateringen) |
| `/inspections/:planId/assets/:assetId/visual` | Checklist |
| `/inspections/:planId/assets/:assetId/measurement-sheet` | Meetstaat |
| `/inspections/:planId/locations/:locationId/floor-plan` | Plattegrond |
| `/settings`, `/chat`, `/documents/:id` | Overig |

Tenant komt uit het eerste hostname-label: `inspexidemo.localhost:5176` → slug `inspexidemo`.
Kale `localhost:5176` → slug `null` → de login toont een **organisatie-kiezer** (relevant voor INS-02).

## Selectors

Er zijn maar **8 `data-testid`'s**; de rest gaat op zichtbare Nederlandse tekst of `id`.

```
plan-card (+ data-norm-type)   asset-row (+ data-asset-name)
tab-meetstaat                  tab-constateringen
constateringen-section         constateringen-list
measurement-sheet-page         completion-wizard
```
Er is **geen** `tab-visueel` en geen `tab-overzicht` — klik op de tekst "Visueel" / "Overzicht".

| Scherm | Element | Selector |
|---|---|---|
| Login | e-mail / wachtwoord / submit | `#email`, `#password`, knop "Inloggen" |
| Login | onthoud mij | `#remember` (staat standaard aan) |
| Lijst | filters | knoppen "Alle (n)", "Gepland (n)", "In behandeling (n)", "Afgerond (n)" |
| Lijst | zoeken | placeholder "Zoek op projectnaam, referentie of plaats..." |
| Plan-detail | tabs | knoppen "Assets" / "Documenten" |
| Plan-detail | **asset toevoegen** | ronde FAB rechtsonder (plus-icoon, géén tekst) |
| Plan-detail | afrond-CTA | knop "Inspectie afronden" (alleen zichtbaar bij ≥1 completed asset) |
| AddAssetSheet | type / naam / identificatie / parent | radio-labels; `#name`; `#identifier`; `#parentAssetId` |
| AddAssetSheet | technische velden | `#technicalData.<fieldKey>` |
| AddAssetSheet | opslaan | knop "Asset toevoegen" (footer) |
| Asset-detail | statusknoppen | "Start inspectie" (new→in_progress), "Afronden" (in_progress→completed) |
| Checklist | antwoorden | knoppen "OK" / "NOK" / "NVT" per item |
| CreateFindingSheet | stap 1 | zoekveld + knop "Eigen constatering" of een template-knop |
| CreateFindingSheet | stap 2 | classificatie-knoppen; textarea's in volgorde: beschrijving, aanbeveling, notities |
| CreateFindingSheet | opslaan | footer-knop "Opslaan" (disabled tot beschrijving én aanbeveling gevuld) |
| Meetstaat | velden | `input[type=number]` per NUMBER-veld; "Afronden" onderaan |
| Wizard | stappen | "Volgende: Samenvatting" → "Volgende: Handtekeningen" → "Indienen ter beoordeling" |
| ConflictBanner | keuze | knoppen "Mijn versie" / "Serverversie"; kolommen Veld/Serverversie/Mijn versie |

## Grenzen — let op wat WEL en NIET afgedwongen wordt

Constanten in `packages/shared/src/constants/index.ts`: `DESCRIPTION_MAX_LENGTH 5000`,
`PHOTO_MAX_COUNT_PER_FINDING 10`, `PHOTO_MAX_COUNT_PER_ASSET 5`, `MAX_ASSET_DEPTH 10`.

**Maar in de PWA zelf:**
- `MAX_ASSET_DEPTH` wordt **nergens gebruikt** → verwacht géén client-blokkade bij diep nesten (INS-07).
- `DESCRIPTION_MAX_LENGTH` wordt **niet afgedwongen** op de finding-textarea's (geen `maxLength`) → 5000+ tekens worden lokaal opgeslagen; afwijzing kan pas bij de server-push komen (INS-18).
- Max foto's is **5 voor zowel finding als asset** (niet 10) — CreateFindingSheet geeft expliciet `maxPhotos={5}`. De `alert("Maximaal N foto's")` is onbereikbaar omdat de knoppen al `disabled` zijn (INS-29).
- Er is **geen eindcontrole/finalCheck-UI** in de meetstaat (INS-26) — alleen meetmiddelen + "Afronden".

**Numerieke clamping** (`components/common/NumericInput.tsx`): clamp gebeurt tijdens `onChange`;
`NaN` leidt tot géén update (geen crash). Let op: de **meetstaat** gebruikt NumericInput (mét clamping),
maar **AddAssetSheet** gebruikt een kale `input[type=number]` met react-hook-form min/max — dus daar
**geen live clamping**, alleen validatiefouten. Dat verschil is precies INS-12 vs INS-21/22.

## Offline simuleren

De app luistert op `online`/`offline`-events, maar leest daarnaast op meerdere plekken direct
`navigator.onLine`. Alleen een event dispatchen is dus **niet genoeg**. Gebruik dit paar via
`javascript_tool`:

```js
// OFFLINE
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
window.dispatchEvent(new Event('offline'));
// ONLINE
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
window.dispatchEvent(new Event('online'));
```

Let op: fetches slagen hiermee technisch nog steeds. Voor INS-36/37 met echte serververificatie is dit
een benadering — vermeld dat in het logboek.

Letterlijke UI-teksten: gele banner **"Geen internetverbinding"** + badge **"{n} wijzigingen wachten"**;
groen na sync **"Gesynchroniseerd"**; rood **"Synchronisatie mislukt"** + "Probeer opnieuw".
Sync triggeren: sync-pil rechtsboven in de header, of de dashboardknop "Synchroniseren".
Auto-sync bij online-worden gebeurt **alleen als er pending changes zijn**.

## Conflicten & circuit-breaker

- Findings en metingen worden **automatisch naar "client" opgelost** — forceer een conflict daarom op
  een **plan of asset**, anders zie je de ConflictBanner nooit (INS-39).
- Circuit-breaker na **3** opeenvolgende cycli met open conflicten; banner-tekst
  **"Synchronisatie gepauzeerd — kies hieronder een versie om verder te syncen"**. De breaker zit in
  het geheugen → een page reload reset hem.
- Chat-sync loopt bewust door tijdens de pauze.

## Sync-contract

`CONTRACT_VERSION = 3` in de PWA; de server geeft óók 3 (geverifieerd) → **géén natuurlijke mismatch**.
De client stuurt de versie niet mee; de check is puur inbound op de pull-response. Voor INS-42 moet je
`window.fetch` patchen zodat `/sync/pull` een andere `contractVersion` teruggeeft. Banner-tekst is exact
**"App bijwerken nodig — synchronisatie is gepauzeerd"** met knop "Vernieuwen".

## Lokale opslag wissen tussen scenario's

Dexie-database heet **`InspectieAppDB`** (schemaversie 14). In dev zijn console-helpers beschikbaar:
```js
await window.clearAllData();   // wist de DB en stuurt naar /login
```
Anders: `indexedDB.deleteDatabase('InspectieAppDB')` + `localStorage.clear()`.

## Beperkingen in een geautomatiseerde browser

- **Foto-input bestaat niet permanent in de DOM**: hij wordt on-the-fly aangemaakt, geklikt en in
  `onchange` weer verwijderd. `file_upload` op een vaste selector werkt dus niet. Werkwijze: patch
  `HTMLInputElement.prototype.click` zodat de native dialoog niet opent, klik de UI-knop, en zet dan
  `input.files` via een `DataTransfer` + `dispatchEvent(new Event('change', {bubbles:true}))`.
- **SpeechRecognition ontbreekt** → `VoiceFieldButton` rendert `null`, de mic-knop verdwijnt volledig.
  Dat is het verwachte graceful gedrag van INS-27. Er is daarnaast een tweede, backend-gestuurde
  voice-indicator op de meetstaat (`voiceApi.checkStatus()`), die staat uit zonder ANTHROPIC_API_KEY.
- **Service worker staat aan in dev** met NetworkFirst-caching op `/api/v1/` (24u). Offline-tests kunnen
  dus gecachte responses terugkrijgen in plaats van echte netwerkfouten.
- Native `confirm()`-dialogen bij "Foto verwijderen?" en bij een nieuwe SW-versie kunnen automatisering
  blokkeren.

## Vooraf gesignaleerde discrepanties met het testscript

| Testgeval | Wat het script verwacht | Wat de code doet |
|---|---|---|
| INS-13 | Locatie toevoegen werkt | `AddLocationSheet` is **nergens geïmporteerd** — niet bereikbaar in de UI |
| INS-14 | Checklist-antwoorden worden opgeslagen | Antwoorden zijn puur React-state; "Opslaan"/"Afronden"/"Notitie" hebben **geen handler** — bij wegnavigeren weg |
| INS-07 | Diepte geblokkeerd boven 10 | `MAX_ASSET_DEPTH` ongebruikt in de PWA |
| INS-18 | Afkap bij 5000 tekens | geen client-side maxLength |
| INS-26 | Eindcontrole-velden | geen UI |
| INS-29 | finding 10 / asset 5 | beide 5 |

**Deze zes moeten empirisch bevestigd worden** — code lezen is geen testbewijs.
