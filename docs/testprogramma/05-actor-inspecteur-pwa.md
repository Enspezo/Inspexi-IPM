# Actor: INSPECTEUR (PWA) — testscript (INS-xx)

**App:** Inspexi-App PWA · `http://inspexidemo.localhost:5176` (**let op poort 5176, subdomein verplicht**)
**Login:** `inspecteur@inspexi-demo.nl` / `Password123!` (extra: `inspecteur2@…` freelancer, `inspecteur@testbedrijf.nl`)
**Rechten:** eigen toegewezen inspecties uitvoeren; offline-first.
**Risicogebieden:** R4 (sync/offline/conflict — hoogste PRA-score), R3 (review-gate bij sync), R6 (numerieke validatie).

**Vooraf:** API met `NODE_ENV=test` (throttle uit), Beheer-API op 3001, PWA-dev op 5176. Service worker is **aan in dev** (`devOptions.enabled`). Offline simuleren via DevTools/Playwright `context.setOffline(true)` — app luistert op online/offline-events.

**Bestaande Playwright-dekking (niet dupliceren):** `e2e/core-flow.spec.ts` dekt de happy-path login→plan→asset→tabs→wizard-open. Dit programma richt zich op **aanmaak, validatie, offline, sync-conflicten, foto/handtekening, echt indienen**. Nuttige testids die de app al biedt: `plan-card[data-norm-type]`, `asset-row`, `tab-constateringen`, `tab-meetstaat`, `measurement-sheet-page`, `completion-wizard`.

Legenda **T**: G=gouden pad, B=grens, F=foutgok, O=offline/sync, A=proces/autorisatie.

---

## Login & tenant

| ID | T | Stap / invoer | Verwacht (orakel) |
|---|---|---|---|
| INS-01 | G | Open `inspexidemo.localhost:5176` → login → dashboard | KPI's laden; initiële sync draait (progress); plannen zichtbaar |
| INS-02 | F | Open **kale** `localhost:5176` (geen subdomein) | Organisatie-kiezer of nette melding; inspecteur-login faalt niet in een crash |
| INS-03 | F | Verkeerd wachtwoord / niet-bestaand e-mail | 401 generiek "Ongeldige inloggegevens" (geen onderscheid bestaat/niet) |
| INS-04 | G | Na een config-wijziging door OA (nieuwe checklist-versie) → sync | Reference-caches ververst; "nieuwere versie beschikbaar"-banner op oud plan |

## Inspectie kiezen & navigeren

| ID | T | Stap | Verwacht |
|---|---|---|---|
| INS-05 | G | Inspecties-lijst → filter planned/in_progress/completed | Filtering werkt; lege filter toont nette lege staat |
| INS-06 | G | Open plan met **ondiepe** boom (A) → assetboom | Boom rendert; assets klikbaar |
| INS-07 | B | Open plan met **diepe** boom (B, ~5 niveaus) → probeer nóg dieper toe te voegen | Tot `MAX_ASSET_DEPTH=10` toegestaan; daarboven geweigerd/gewaarschuwd |
| INS-08 | B | Open plan met **brede** boom (C, 25 assets) | Lijst scrollt vlot; geen UI-freeze |

## Asset/locatie aanmaken (offline-capabel)

| ID | T | Stap / invoer | Verwacht |
|---|---|---|---|
| INS-09 | G | Asset toevoegen: type + naam + technische velden | Opgeslagen lokaal; nodeNumber toont "concept" (server kent later toe) |
| INS-10 | F | Asset toevoegen **zonder naam** / zonder type | Geblokkeerd: "Naam is verplicht" / "Selecteer een type" |
| INS-11 | A | Asset toevoegen met verplichte parent maar geen parent gekozen (`canBeRoot=false`) | Geblokkeerd: "Selecteer een parent asset"; async parent-typevalidatie toont AlertCircle bij verkeerde parent |
| INS-12 | F | Numeriek technisch veld: tekst `abc`, `1,5` (komma), `-1` onder min, waarde boven max | Tekst geweigerd door number-input; komma → browserafhankelijk (documenteer); clamping op min/max tijdens typen |
| INS-13 | G | Locatie toevoegen (type + naam) | Opgeslagen; verschijnt in boom |

## Visuele inspectie / checklist → constatering

| ID | T | Stap | Verwacht |
|---|---|---|---|
| INS-14 | G | Open asset → tab Visueel → loop checklist af OK/NVT | Voortgangsbalk vult; opgeslagen |
| INS-15 | G | Zet een item op **NOK** | CreateFindingSheet opent automatisch |
| INS-16 | G | Constatering: kies finding-template → classificatie → omschrijving + aanbeveling + foto | Opgeslagen; gekoppeld aan asset + plan |
| INS-17 | F | Constatering opslaan met lege omschrijving óf lege aanbeveling | Opslaan-knop disabled tot beide gevuld |
| INS-18 | B | Omschrijving 5000+ tekens (raakt `DESCRIPTION_MAX_LENGTH`) | Geweigerd/afgekapt bij 5000 |
| INS-19 | G | Constatering met classificatie **C1 (kritiek)** | Finding `isCritical` gemarkeerd (voedt online-herstel + herinspectie-flow) |

## Meetstaat (numerieke grenzen — R6)

| ID | T | Stap / invoer | Verwacht |
|---|---|---|---|
| INS-20 | G | Open meetstaat → vul numerieke velden binnen grenzen → formule-veld berekent | Auto-save (1s debounce); formule klopt |
| INS-21 | B | Waarde **onder min** (bv. -5 bij min 0) | Direct geklemd naar min tijdens onChange |
| INS-22 | B | Waarde **boven max** | Geklemd naar max |
| INS-23 | F | Komma-decimaal `1,5` vs punt `1.5` | Number-input: punt werkt; komma browserafhankelijk (documenteer verschil) |
| INS-24 | F | Tekst in numeriek veld `abc` / plak `NaN`/`Infinity` | Genegeerd (NaN → geen update); geen crash |
| INS-25 | G | Pass/fail-veld: waarde die net **faalt** (isolatie < 1.0 MΩ) vs net **haalt** | Border rood bij fail, groen bij pass |
| INS-26 | G | Meetmiddelen selecteren (prefill + defaults) → eindcontrole → afronden meetstaat | Record completed met finalCheck-velden |
| INS-27 | B | Voice-knop: in headless Chromium ontbreekt SpeechRecognition | Mic-knop **verdwijnt** (VoiceFieldButton → null) of toont "niet ondersteund"; typen blijft werken (graceful) |

## Foto & handtekening

| ID | T | Stap | Verwacht |
|---|---|---|---|
| INS-28 | G | Foto toevoegen via file-input (`setInputFiles`) op asset/finding | Gecomprimeerd (~2MB), thumbnail, opgeslagen als blob |
| INS-29 | B | Meer dan max foto's (finding 10, asset 5) | `alert("Maximaal N foto's")`, knoppen disabled |
| INS-30 | F | Niet-afbeelding uploaden (`.pdf`) op fotoveld | `accept=image/*` filtert; geen crash |

## Inspectie afronden (wizard-guards)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| INS-31 | A | "Inspectie afronden"-CTA vóórdat een asset `completed` is | CTA **niet** zichtbaar (`canCompleteInspection` = ≥1 asset completed) |
| INS-32 | G | Markeer ≥1 asset completed → CTA verschijnt → open wizard | Wizard stap "assets" met auto-selectie voltooide assets |
| INS-33 | A | Wizard stap 1: deselecteer alles → "Volgende" | Disabled (`selectedAssetIds.size > 0` vereist) |
| INS-34 | G | Wizard: assets → samenvatting → handtekeningen (leeg laten = mag) → Indienen | Plan → `pending_review`, `submittedAt` gezet, navigatie naar lijst |
| INS-35 | O | Direct daarna: sync push naar server | Data verschijnt in Portal; reviewer krijgt notificatie |

## Offline & sync-conflicten (R4 — kern)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| INS-36 | O | Zet browser **offline** → maak asset + finding + meetstaat aan | Gele banner "Geen internetverbinding" + "{n} wijzigingen wachten"; alles lokaal opgeslagen |
| INS-37 | O | Ga weer **online** | Auto-sync bij online-worden; pending-teller loopt terug naar 0; data op server |
| INS-38 | O | Offline login (besluit A5, 28-07-2026): (a) log uit mét pending wijzigingen → bevestigingsdialoog; (b) log uit, ga offline, probeer in te loggen (bekend én onbekend e-mail) | (a) Dialoog "Niet-gesynchroniseerde wijzigingen" met aantal + "Annuleren"/"Toch uitloggen"; zonder pending → direct uitgelogd. (b) Offline inloggen ná uitloggen is **niet** mogelijk (geen credentials offline); actiegerichte melding "Geen internetverbinding. Inloggen kan alleen met internet — ga (tijdelijk) online en log dan in…", identiek voor bekend/onbekend e-mail (geen enumeratie). NB: wie níet uitlogt houdt offline gewoon toegang (B-219-hertest) |
| INS-39 | O | **Conflict forceren**: wijzig hetzelfde record in Portal én offline in PWA, dan sync | ConflictBanner amber "kies een versie"; kolommen Veld/Serverversie/Mijn versie; "Mijn versie"/"Serverversie" lost op via `/sync/resolve` |
| INS-40 | O | Laat conflicten 3 sync-cycli openstaan | Circuit-breaker pauzeert sync ("Synchronisatie gepauzeerd — kies hieronder een versie"); chat-sync loopt door |
| INS-41 | O | Vier-ogen-gate bij sync: push een plan naar `completed`/`approved` zonder review terwijl `inspectionReviewEnabled` | Server weigert (400 "moet eerst beoordeeld worden"); conflict/afwijzing netjes getoond |
| INS-42 | O | Contract-mismatch simuleren (indien mogelijk via oudere client/CONTRACT_VERSION) | Rode banner "App bijwerken nodig — synchronisatie gepauzeerd" + Vernieuwen-knop; geen data-corruptie |

## Autorisatie / isolatie in de PWA

| ID | T | Stap | Verwacht |
|---|---|---|---|
| INS-43 | A | Log in als `inspecteur@testbedrijf.nl` op `testbedrijf.localhost:5176` | Ziet alleen testbedrijf-plannen, nooit inspexidemo-data |
| INS-44 | A | Probeer via URL een plan-id van een **andere org** te openen | 404/geen toegang; geen cross-tenant lek |
