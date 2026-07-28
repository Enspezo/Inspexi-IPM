# Logboek — Actor INSPECTEUR (PWA), INS-01 t/m INS-44

**Uitgevoerd:** 2026-07-27 · **App:** Inspexi-App PWA `http://inspexidemo.localhost:5176` (Vite dev, service worker actief)
**API:** :3001 (`NODE_ENV=test`) · **Portal (verificatie):** `inspexidemo.localhost:5173` · **DB:** psql :5433
**Drivers:** Chrome-pane (interactief) + Playwright/Chromium (echte `context.setOffline`, screenshots)

**Tellingen:** PASS 25 · FAIL 17 · SKIP 2 · BLOCKED 0
**Bevindingen:** B-201 t/m B-223 (2× S1, 8× S2, 13× S3)

> **Harness-afwijkingen (expliciet gelogd, zie B-202/B-204/B-205).** Drie referentie-caches worden door
> de PWA nooit (correct) gevuld, waardoor asset-aanmaak, checklist en meetstaat via de UI onbereikbaar zijn.
> Om de onderliggende schermen tóch te kunnen testen zijn `cachedAssetTypes`, `cachedChecklists` en
> `cachedMeasurementSheetTemplates` in IndexedDB handmatig gevuld met de **echte serverdata** (via de
> bestaande endpoints `/asset-types`, `/checklists/:id`, `/measurement-sheet-templates/:id`). Testgevallen
> die alleen dankzij die injectie konden draaien zijn gemarkeerd met **`*`**. Voor INS-11/12 is daarnaast
> één synthetisch assettype (`test_child_only`, parent verplicht, min 0 / max 100) geïnjecteerd omdat de
> geseede types géén parent-constraints en géén min/max hebben.

---

## Login & tenant

| ID | Status | Waarneming |
|---|---|---|
| INS-01 | PASS (oud orakel) — hertest open | Login OK; initiële sync draait (`/sync/pull` 200 + referentie-caches); dashboard-KPI's laden; 9 plannen zichtbaar; geen onafgevangen JS-fout. Kanttekening (destijds): KPI "Toegewezen 9" telde álle org-plannen, ook 3 met `assignedTo = NULL` (B-223a). Inmiddels opgelost via besluit A3 (optie b, InspeXi #40): pull-scope bewust ongewijzigd (alle org-plannen), KPI "Toegewezen" telt nu alleen eigen plannen (6 i.p.v. 9: 5× `assign: true` in seed-tp + het demoplan), lijst heet neutraal "Inspecties" + "Toegewezen aan mij"-badge. De PASS is behaald tegen het oude orakel; hertest tegen het herschreven orakel staat open. |
| INS-02 | PASS | Kale `localhost:5176` → organisatie-kiezer met NL-uitleg. Leeg subdomein → "Vul een geldig subdomein in." bij het juiste veld. `<script>alert(1)</script>` wordt gesaneerd naar `scriptalert1`, navigeert naar `scriptalert1.localhost:5176` en toont "De organisatie 'scriptalert1' bestaat niet of is niet actief." — als **tekst**, geen uitvoering. |
| INS-03 | PASS | Onbekend e-mail én bestaand e-mail + fout wachtwoord geven beide `POST /auth/login → 401` met exact dezelfde melding "Onjuiste e-mail of wachtwoord". Geen enumeratie. |
| INS-04 | **FAIL** | De PWA haalt org-checklists **nooit** op (`cacheChecklists()` wordt nergens aangeroepen); `cachedChecklists` blijft leeg. `hasNewerChecklistVersion()` draait alleen als er een dynamische checklist gevonden is → de "nieuwere versie beschikbaar"-banner is structureel onbereikbaar. → **B-204** |

## Inspectie kiezen & navigeren

| ID | Status | Waarneming |
|---|---|---|
| INS-05 | PASS | Filters Alle(9)/Gepland(4)/In behandeling(2)/Afgerond(2) filteren correct (Gepland = draft+planned, cancelled alleen onder "Alle"). Zoeken op `zzzz'; DROP TABLE--` → nette lege staat "Geen inspecties gevonden / Probeer een andere zoekopdracht". |
| INS-06 | **FAIL** | Plan A meldt "3 Assets" maar de Assets-sectie is **leeg**; geen enkele asset klikbaar. Reproduceerbaar op álle plannen. → **B-201** |
| INS-07 | **FAIL** | `MAX_ASSET_DEPTH = 10` wordt noch in de PWA noch op de server afgedwongen: via `/sync/push` zijn nodes t/m **diepte 13** zonder waarschuwing aangemaakt (EI-0035…EI-0043). → **B-216** |
| INS-08 | **FAIL** | Plan C toont "25 Assets" met een lege lijst (zelfde oorzaak als INS-06). Geen UI-freeze, pagina rendert direct. → **B-201** |

## Asset/locatie aanmaken

| ID | Status | Waarneming |
|---|---|---|
| INS-09 | **FAIL** | "Type asset *" toont **geen enkele optie**: `cachedAssetTypes` is leeg omdat `/asset-types` `data: [...]` teruggeeft terwijl de PWA `data.assetTypes` verwacht (console: "[SyncService] No asset types in response"). Asset kon tóch opgeslagen worden mét `typeCode: ""`. Na sync kent de server `nodeNumber = "-0033"` toe, maar dat nummer bereikt de client **nooit** (blijft `null`, ook na 2 extra syncs). → **B-202**, **B-203** |
| INS-10 | **FAIL** | "Naam is verplicht" verschijnt correct in het NL bij het juiste veld. Er is echter **geen** "Selecteer een type"-validatie: opslaan met lege `assetType` slaagt. → **B-202** |
| INS-11 | PASS* | Met een geïnjecteerd type `canBeRoot=false`: "Gekoppeld aan" wordt verplicht (`*`), de dropdown vult zich met toegestane parents en er verschijnt een AlertCircle + NL-melding "TESTTYPE alleen-kind kan niet als root-asset worden toegevoegd". Kanttekening: de select mist een lege placeholder-optie, waardoor visueel een parent geselecteerd lijkt terwijl de formulierwaarde leeg is (B-223). |
| INS-12 | **FAIL** | `abc` wordt door de number-input geweigerd (waarde blijft leeg); `1,5` → `1.5` (Chrome interpreteert de komma als decimaalteken). `-1` (< min 0) en `999` (> max 100) worden niet geklemd (verwacht: AddAssetSheet gebruikt geen NumericInput) maar blokkeren het opslaan **zonder enige foutmelding** — klik op Opslaan doet zichtbaar niets. → **B-215** |
| INS-13 | **FAIL** | Er is **geen** UI om een locatie toe te voegen: de FAB opent altijd `AddAssetSheet`, het kebab-menu bevat alleen Bewerken/Archiveren/Annuleren. `AddLocationSheet.tsx` bestaat maar wordt nergens geïmporteerd. → **B-213** |

## Visuele inspectie / checklist → constatering

| ID | Status | Waarneming |
|---|---|---|
| INS-14 | **FAIL** | Voor élke asset: "Geen checklist beschikbaar — Voor dit type asset (electrical_installation) en norm (NEN1010) is nog geen checklist beschikbaar", terwijl `CL-NEN1010 v2.0 ACTIEF` exact op die combinatie matcht. Mét geïnjecteerde cache rendert de checklist wél en vult de voortgangsbalk naar 100%, maar "Opslaan" heeft **geen handler**: na herladen staat alles weer op 0/2. → **B-204**, **B-210** |
| INS-15 | PASS* | NOK op een checklistitem opent direct de sheet "Constatering toevoegen" (zoekveld + "Eigen constatering"; "Geen templates gevonden" — de org heeft 0 finding-templates in de DB, dat is testdata, geen defect). |
| INS-16 | **FAIL** | Constatering wordt lokaal correct opgeslagen mét `assetNodeId` + `inspectionPlanId`, maar synchroniseert **nooit**: `visualInspectionId` krijgt de *checklistItemId* toegewezen → server: `Foreign key constraint violated: imp_findings_visual_inspection_id_fkey`. Na sync: 0 rijen op de server, record blijft eeuwig pending, géén foutmelding in de UI. → **B-206**, **B-211** |
| INS-17 | PASS | Footer-knop "Opslaan" is `disabled` zolang beschrijving óf aanbeveling leeg is; wordt actief zodra beide gevuld zijn. |
| INS-18 | **FAIL** | Geen `maxLength` op de textarea's; 5108 tekens worden zonder waarschuwing of afkap lokaal opgeslagen. Serverzijdige weigering bij 5000 kon niet worden vastgesteld omdat het record al op de FK-fout uit B-206 strandt. |
| INS-19 | **FAIL** | Classificatie "Kritiek" schrijft de **hardgecodeerde** waarde `{"risico":"kritiek"}` weg. De org gebruikt `SEVERITY` met opties C1/C2/C3/FI (C1 = `isCritical`). De waarde matcht dus geen enkel geconfigureerd model, en het record bereikt de server sowieso niet → `Finding.isCritical` wordt nooit gezet; de PRD-14-flows (online herstel, herinspectie) krijgen geen kritieke constateringen uit de PWA. → **B-222** |

## Meetstaat

| ID | Status | Waarneming |
|---|---|---|
| INS-20 | PASS* | Zónder injectie rendert de meetstaat **nul** invoervelden (de PWA cacht de *lijst*-respons, die geen `sections` bevat) → **B-205**. Mét de echte template: "+ Rij toevoegen" werkt, auto-save met ~1 s debounce schrijft naar Dexie (`{sections:{isolation:{rows:[{r_iso:0.5}]}}}`). Formule-velden komen in deze template niet voor. |
| INS-21 | SKIP | Veld `r_iso` heeft **geen** `min_value` in de template → clamping niet testbaar. Waargenomen: `-5 MΩ` wordt zonder waarschuwing geaccepteerd en opgeslagen. |
| INS-22 | SKIP | Idem, geen `max_value` gedefinieerd. |
| INS-23 | PASS | `2,5` → `2.5`; `1.5` → `1.5`. In deze Chrome-build wordt de komma als decimaalteken geaccepteerd (browser-/locale-afhankelijk, gedocumenteerd). |
| INS-24 | PASS | `abc` wordt genegeerd (waarde blijft leeg). Geplakte `Infinity` en `NaN` worden door de number-input geweigerd; opgeslagen waarde wordt `null`. Geen crash, geen console-fout. |
| INS-25 | PASS | `0.5` (< 1.0 MΩ) → `border-red-500 ring-red-200 bg-red-50`; `1.0` en `2.5` → `border-green-500 bg-green-50`. Tellers "1 Pass / 0 Fail / 0 Open" kloppen. |
| INS-26 | **FAIL** | Meetmiddelen-selectie werkt inclusief prefill van de 2 default-instrumenten en kalibratiestatus (Geldig / Verloopt binnenkort / Verlopen); "Afronden" zet het record op COMPLETED met `completedAt`. Er is echter **geen eindcontrole-/finalCheck-UI** — het record krijgt geen finalCheck-velden. Bovendien synchroniseert het record daarna nooit (B-207). |
| INS-27 | PASS | `SpeechRecognition` is in deze Chromium wél aanwezig, dus de knop verdwijnt niet; na weigering van de microfoon-permissie kleurt de knop rood (mic-off-icoon), zonder crash of blokkade. Handmatig typen blijft werken. Graceful. |

## Foto & handtekening

| ID | Status | Waarneming |
|---|---|---|
| INS-28 | PASS | 4000×3000 PNG van 41,3 MB → opgeslagen blob 1,49 MB `image/jpeg` + 9 kB thumbnail. Kanttekening: de opgeslagen metadata (`fileSize 41283787`, `width 4000`, `height 3000`) beschrijven het **origineel**, niet de gecomprimeerde/geschaalde foto. → **B-221** |
| INS-29 | PASS | Max is **5** voor een asset (script noemt 10 voor findings / 5 voor assets). Bij 5/5 worden "Camera" en "Galerij" `disabled`; de `alert("Maximaal N foto's")` is daardoor onbereikbaar. Gedrag zelf is netjes. |
| INS-30 | PASS | De on-the-fly file-input draagt `accept="image/*"`. Een geforceerd geïnjecteerde `.pdf` wordt geweigerd met de NL-alert "Fout bij het verwerken van foto"; geen foto opgeslagen, geen crash. |

## Inspectie afronden (wizard-guards)

| ID | Status | Waarneming |
|---|---|---|
| INS-31 | PASS | Zonder afgeronde asset is de CTA "Inspectie afronden" niet aanwezig in de DOM. |
| INS-32 | PASS | Na 1 asset `completed` verschijnt de CTA; de wizard opent op stap "assets" met de afgeronde asset **auto-geselecteerd**. Niet-afgeronde assets tonen ⚠ + "Asset nog niet afgerond". Injectiestring `<script>alert('xss')</script>` in een assetnaam wordt als tekst gerenderd. |
| INS-33 | PASS | "Deselecteer alle" → 0 selecties → "Volgende: Samenvatting" is `disabled`. |
| INS-34 | PASS | Samenvatting → handtekeningen (beide optioneel, leeg gelaten) → Indienen. Opmerkingenveld accepteert `'quote" & <b>tag</b>` veilig. **Dubbelklik** op "Indienen ter beoordeling" leverde géén dubbele submit. Plan lokaal → "Wacht op review" + "Wacht op synchronisatie", navigatie terug naar de lijst. |
| INS-35 | **FAIL** | De data komt correct op de server (`status = pending_review`, `submitted_at` gezet, geverifieerd via psql). Er wordt echter **geen** `INSPECTIEPLAN_TER_REVIEW`-notificatie gedispatcht — de sync-service kent die dispatch niet (alleen het REST-`submit()`-pad). Het geteste plan had bovendien `reviewer_id = NULL`. → **B-218** |

## Offline & sync-conflicten (R4)

| ID | Status | Waarneming |
|---|---|---|
| INS-36 | **FAIL** | Gele banner "Geen internetverbinding" verschijnt direct; assetstatus, foto en meetstaatwaarden worden lokaal opgeslagen (`_pendingSync` / `_pendingUpload`). De badge "{n} wijzigingen wachten" verschijnt echter pas na de 30 s-poll (direct na de mutatie: afwezig). Bovendien geeft **herladen/deeplink terwijl offline** `net::ERR_INTERNET_DISCONNECTED`, en crasht client-side navigatie naar een nog niet geladen route in de ErrorBoundary ("Er is iets misgegaan"). → **B-219**, **B-223** |
| INS-37 | **FAIL** | Bij online-worden vindt **geen** auto-sync plaats: 55 s lang nul `/sync/*`-calls, wijziging blijft pending. Root cause bewezen: wacht je ≥35 s offline (zodat de 30 s-poll `pendingCount` bijwerkt) dán synct hij wél direct bij online-worden — de effect-dependency mist `pendingCount`. → **B-208** |
| INS-38 | **FAIL** | Na uitloggen, offline, inloggen met het **zojuist gebruikte** e-mailadres → geweigerd met "Geen internetverbinding. Login is alleen mogelijk met een eerdere sessie." (uitloggen wist `userSession`). Onbekend e-mailadres geeft dezelfde nette NL-melding — dat deel is correct. → **B-220** |
| INS-39 | PASS | Conflict geforceerd op een **assetNode** (offline statuswijziging + serverwijziging van dezelfde rij). Sync → amber ConflictBanner "1 synchronisatie-conflict — kies een versie", uitklapbaar met kolommen **Veld / Serverversie / Mijn versie** (`name`, `statusCode`). "Mijn versie" én "Serverversie" lossen op via `POST /sync/resolve → 201`; `imp_sync_queue` gaat naar `completed`, banner → "Gesynchroniseerd (0 items)". **Kritieke kanttekening:** de conflictdetectie werkt alléén als het serverrecord al eens door een device gepusht is (`synced_at` gevuld — 3 van 52 nodes). Voor de overige 49 wordt de portalwijziging **stil overschreven**. → **B-209** |
| INS-40 | PASS | Met een openstaand conflict: cyclus 1 en 2 doen pull+push, vanaf cyclus **3** verschijnt "Synchronisatie gepauzeerd — kies hieronder een versie om verder te syncen" en doet cyclus 4 géén enkele netwerkcall meer. Na resolve loopt de sync weer. |
| INS-41 | PASS | `POST /sync/push` met `statusCode: "completed"` respectievelijk `"approved"` op een plan zonder `reviewedAt` → geweigerd met de NL-melding "Dit plan moet eerst beoordeeld worden (vier-ogen-principe)"; status blijft `pending_review` (psql-geverifieerd). Kanttekeningen: de HTTP-status is **201** met de fout in `errors[]` (script verwachtte 400), de PWA toont die fout niet (B-211), en `reviewerId` blijkt wél client-schrijfbaar (B-217). |
| INS-42 | PASS | Met een gepatchte `/sync/pull` (`contractVersion: 99`): rode banner "App bijwerken nodig — synchronisatie is gepauzeerd" + knop "Vernieuwen"; console "⛔ Contract mismatch — sync geblokkeerd"; push wordt overgeslagen; lokale data ongewijzigd (8 plannen / 41 nodes / 11 findings). |

## Autorisatie / isolatie

| ID | Status | Waarneming |
|---|---|---|
| INS-43 | PASS | Login `inspecteur@testbedrijf.nl` op `testbedrijf.localhost:5176`: exact 1 plan (`TB-RAP-001`), 2 assetnodes, 0 findings, allemaal `orgId = ac074512…`. Geen spoor van inspexidemo-data in Dexie of UI. |
| INS-44 | PASS | `/inspections/<inspexidemo-plan-id>` op het testbedrijf-subdomein → geen crash, geen data, redirect naar de eigen inspectielijst. Directe API-calls met het testbedrijf-token: `GET /inspection-plans/<vreemd id>` → **404** "Inspectieplan niet gevonden"; `GET /asset-nodes/<vreemd id>` → **404** "Node niet gevonden". Bestaan wordt niet onthuld. |

---

## Bevindingen-index

| ID | Sev | Titel | Testgeval(len) |
|---|---|---|---|
| B-201 | S2 | Assetboom op de inspectiepagina blijft altijd leeg — geen enkele asset bereikbaar | INS-06, INS-08 |
| B-202 | S2 | Asset-types worden nooit gecached (responsevorm-mismatch) — asset toevoegen onmogelijk | INS-09, INS-10 |
| B-203 | S3 | Server accepteert lege/onbekende `typeCode`; nodeNumber wordt `-0033` en bereikt de client nooit | INS-09 |
| B-204 | S2 | Org-checklists worden nooit opgehaald — visuele inspectie structureel onbereikbaar | INS-04, INS-14 |
| B-205 | S2 | Meetstaat-template zonder secties gecached — geen invoervelden; met secties crasht een serverrecord | INS-20 |
| B-206 | **S1** | Constateringen synchroniseren nooit: `visualInspectionId` krijgt de checklistItemId | INS-16, INS-19 |
| B-207 | **S1** | Meetstaat-records synchroniseren nooit: verplichte `templateVersion` ontbreekt in de push | INS-26 |
| B-208 | S2 | Geen auto-sync bij online-worden door verouderde `pendingCount` | INS-37 |
| B-209 | S2 | Serverwijzigingen worden stil overschreven zolang `synced_at` NULL is (geen conflictdetectie) | INS-39 |
| B-210 | S2 | Checklist-antwoorden worden niet opgeslagen — "Opslaan" heeft geen handler | INS-14 |
| B-211 | S2 | Mislukte sync blijft onzichtbaar: de rode banner wordt direct overschreven door de statuspoll | INS-16, INS-26, INS-41 |
| B-212 | S3 | Rauwe Prisma-fout met serverpad, broncode en payload in de sync-respons | INS-16, INS-26 |
| B-213 | S2 | Dode UI: "Locatie toevoegen" onbereikbaar; plan-menu Bewerken/Archiveren/Annuleren zonder handler | INS-13 |
| B-214 | S3 | Footerknoppen van AddAssetSheet worden door de bottom-navigatie bedekt | INS-09 |
| B-215 | S3 | Min/max op technische velden blokkeert opslaan zonder enige foutmelding | INS-12 |
| B-216 | S3 | `MAX_ASSET_DEPTH` nergens afgedwongen — diepte 13 zonder waarschuwing geaccepteerd | INS-07 |
| B-217 | S3 | INSPECTEUR kan via `/sync/push` de `reviewerId` van een plan zetten (ook zichzelf) | INS-41 |
| B-218 | S3 | Indienen via sync stuurt geen `INSPECTIEPLAN_TER_REVIEW`-notificatie | INS-35 |
| B-219 | S3 | Offline herladen/deeplink faalt; offline route-navigatie crasht in de ErrorBoundary | INS-36 |
| B-220 | S3 | Offline inloggen na uitloggen onmogelijk — de "eerdere sessie"-route is onbereikbaar | INS-38 |
| B-221 | S3 | Fotometadata beschrijft het origineel, niet de opgeslagen gecomprimeerde foto | INS-28 |
| B-222 | S2 | Constatering-classificatie hardgecodeerd (`risico`) — `isCritical` wordt nooit gezet | INS-19 |
| B-223 | S3 | Bundel kleinere afwijkingen (KPI-scope, 30 s-latency, wizard-guard, dubbel record, select-placeholder, wees-conflict) | div. |
