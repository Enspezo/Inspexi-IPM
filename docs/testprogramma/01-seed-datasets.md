# Seed-datasets — specificatie voor het testprogramma

> Deze spec beschrijft de **gevarieerde testdata** die de uitvoerende sessie als `apps/api/prisma/seed-testprogramma.ts` bouwt (fase 0). Doel: bewust verschillende code-paden en randgevallen raken. Idempotent opzetten; cleanup-volgorde uit `CLAUDE.md` respecteren (let op AssetNode RESTRICT-FK's: `inspectionPlanLocation` en `standaloneMeasurement` vóór `assetNode`).
>
> **Bouw voort op de bestaande seed** (`seed.ts` + `seed-lookups.ts` + `SEED_DEMO=1`) en vul aan. Wachtwoord overal: `Password123!`.

---

## A. Organisaties (feature-variatie → test gating + isolatie)

| Slug | Naam | Plan | Bijzonderheid | Doel |
|---|---|---|---|---|
| `inspexidemo` | InspeXi Demo | Compleet | Alle features; `quoteApprovalThreshold=10000`, approver=MANAGER; `SEED_DEMO=1`-extra's (magic-link, AI-review, online-herstel) | Hoofd-happy-path org |
| `testbedrijf` | Test Bedrijf | Basis | Alleen basis-features; geen offertes/planning-compleet | Feature-gating + cross-tenant tegenpartij |
| `inspexibasis` | InspeXi Basis | Basis | Minimale features | Gating-grenzen |
| `inspexicompleet` | InspeXi Compleet | Compleet | Alles aan, géén SEED_DEMO-extra's | Config zonder demo-data |
| `inspeximix` | InspeXi Mix | Basis + override `WORKFLOW_COMPLEET=true` | Org-feature-override bovenop plan | Override-pad |
| `randorg` *(nieuw)* | Råndбedrijf 试 🔧 | Compleet | **Naam met emoji/RTL/CJK**; slug net geldig (`randorg`) | Unicode-robuustheid overal waar orgnaam toont |

> Test tevens: org aanmaken met **ongeldige slug** (`Rand-Org`, `RÄND`, `a`) moet in de UI/DTO falen (regex `^[a-z0-9]+$`, naam min 2).

---

## B. Gebruikers per org (rol-variatie → autorisatie)

**inspexidemo** (volledige rolset):
- `admin@inspexi-demo.nl` — ORG_ADMIN
- `manager@inspexi-demo.nl` — MANAGER (default approver)
- `backoffice@inspexi-demo.nl` — BACKOFFICE
- `werkvoorbereider@inspexi-demo.nl` — WERKVOORBEREIDER
- `inspecteur@inspexi-demo.nl` — INSPECTEUR (DIENSTVERBAND, wekelijks beschikbaar ma–vr 08–17)
- `inspecteur2@inspexi-demo.nl` *(nieuw)* — INSPECTEUR (FREELANCE, **geen** baseline; alleen losse BESCHIKBAAR-uitzonderingen) → test "freelancer standaard niet beschikbaar"
- `multi@inspexi-demo.nl` *(nieuw)* — rollen `[MANAGER, INSPECTEUR]` → test dubbelrol
- `superuser@inspexi.nl` — SUPERUSER (geen org)

**testbedrijf:** `admin@testbedrijf.nl` (ORG_ADMIN), `inspecteur@testbedrijf.nl` (Henk Groot, FREELANCE + wekelijkse beschikbaarheid).

**randorg:** `admin@randorg.nl` (ORG_ADMIN), plus een gebruiker met **extreem lange naam** (voornaam 100 tekens) en één met naam die op een HTML-tag lijkt (`<b>Piet</b>`) → XSS/escaping-check in lijsten en documenten.

---

## C. Contacten / relaties (rommelige data → validatie + weergave)

Seed in `inspexidemo` een spreiding:
1. **Netjes bedrijf** — COMPANY, compleet: KvK, btw, e-mail, telefoon, adres `1012AB Amsterdam`, 2 contactpersonen.
2. **Particulier zonder e-mail** — INDIVIDUAL, alleen voor+achternaam, geen e-mail/telefoon → test `—`-fallbacks en "verstuur offerte" zonder e-mail.
3. **Lange-naam-bedrijf** — companyName 200+ tekens, adres zonder postcode.
4. **Emoji/unicode-contact** — naam `Tëst 测试 🚀`, adres met buitenlandse "postcode" `SW1A 1AA` (VK-formaat) → test dat backend geen NL-regex afdwingt (mag door) maar wél netjes toont.
5. **Injectie-achtig contact** — companyName `Robert'); DROP TABLE--`, notitie met `<script>alert(1)</script>` → test escaping in overzicht, detail én gegenereerde documenten.
6. **Klantgroep + prijstabel** — één contact in een klantgroep met een gekoppelde staffelprijstabel → test dat offerte-regels de juiste prijs pakken.

---

## D. Producten & prijstabellen (berekening + grenzen)

- Product met **FIXED** prijs (normaal), product met **TIERED** staffel (3 tiers).
- Product met prijs `0,00` en één met prijs `9999999,99` → test bedragweergave + goedkeuringsdrempel.
- Btw-tarieven 0%, 9%, 21% → test btw-berekening in offerte-totalen.

---

## E. Aanvragen (Request) — statusspreiding

Per bron (MANUAL/WEB_FORM/EMAIL/PHONE) minstens één, verdeeld over statussen NIEUW / IN_BEHANDELING / OFFERTE_GEMAAKT / GEWONNEN / VERLOREN(+reden) / ON_HOLD. Eén met **titel van 1 teken**, één met titel van 2000+ tekens (geen backend-max) → test weergave/afkapping.

---

## F. Offertes (Quote) — lifecycle- + bedragspreiding

Maak offertes in **elke** status: CONCEPT, TER_GOEDKEURING, GOEDGEKEURD, VERSTUURD, BEKEKEN, GEACCEPTEERD, AFGEWEZEN, VERLOPEN. Plus randgevallen:
- **Onder de drempel** (€ 500) → mag zonder goedkeuring verstuurd.
- **Boven de drempel** (€ 25.000) → moet TER_GOEDKEURING vóór versturen.
- **Nul regels** → test versturen van lege offerte (verwacht: blokkeren of leeg totaal).
- **Regel met negatieve `unitPrice` / korting > 100% / vatRate 250%** → let op: backend accepteert dit (geen @Min/@Max); UI heeft `min=0`-hint. **Dit is een bewust doeltestgeval** (zie BO-13..16): documenteer of het totaal onzinnig wordt.
- **Publieke token** actief op de VERSTUURD-offerte → test `/offerte/:token` anoniem.

---

## G. Projecten, planning & beschikbaarheid

- Eén project uit een GEACCEPTEERDE offerte (auto-aangemaakt) + één handmatig.
- PlanningItems: enkeldags (NOG_TE_PLANNEN, GEPLAND) en meerdaags (sessieCount 2 en 30 = grens; test ook count 1 en 31 = ongeldig via API).
- **Beschikbaarheidsconflict**: een sessie op een dag waarop `inspecteur@inspexi-demo.nl` een GEBLOKKEERD-uitzondering heeft → planning-assign moet 409+warnings geven.
- Sessie met `scheduledDate` **in het verleden** → geen guard, wordt geaccepteerd (documenteer als S3-kandidaat).

---

## H. Inspectiedomein (voor Portal-review én PWA)

**AssetNode-bomen van wisselende vorm** (unified boom, ltree):
- Boom A (ondiep): 1 hoofdlocatie → 3 assets.
- Boom B (diep): hoofdlocatie → deellocatie → deellocatie → asset → sub-asset (diepte ~5; test `MAX_ASSET_DEPTH=10`-grens door in de PWA nóg dieper te proberen).
- Boom C (breed): 1 locatie → 25 assets → test lijst-performance/scroll.

**Inspectieplannen** in verschillende statussen (draft / planned / in_progress / pending_review / approved / completed / cancelled), gekoppeld aan verschillende **normtypes** (NEN1010, NEN3140, SCOPE_8, SCOPE_10, SCOPE_12, IEC62446_1) zodat verschillende checklists/meetstaten laden.

**Checklists & templates:** minstens één checklist per normtype met OK/NOK/NVT-items; een checklist met een **nieuwere versie** (ACTIEF) dan wat op een oud plan hangt → test "nieuwere versie beschikbaar"-banner in PWA.

**Meetstaat-templates:** één met numerieke velden met `minValue`/`maxValue`/`decimals` en pass/fail-regels (bv. isolatieweerstand ≥ 1.0 MΩ) → test clamping, komma/punt, pass/fail-kleuring.

**Finding-templates & classificatiemodel:** een classificatiemodel met opties waarvan er één `isCritical=true` (C1) → voedt online-herstel-kritiek-flow.

**Voor online herstel:** minstens één plan met `onlineRepairEnabled=true` + uniek `referenceNumber` (bv. `RAP-TEST-100`) + `addressPostalCode` (bv. `1012AB`) en een **open kritieke finding** + een **niet-kritieke open finding**.

**Voor documentgeneratie:** een approved plan met gegenereerd (ondertekenbaar) document in status PENDING_SIGNATURES + een openstaand `signature-request` (voor de publieke `/sign/:requestId`-test).

---

## I. Client-portal (ClientUser)

- `inspexidemo`: demo-klant met **wachtwoordloze magic-link** `demo-klant-magic` (uit `SEED_DEMO=1`, 30d TTL) → directe login.
- Eén ClientUser met rol **VIEWER** (mag niet tekenen), één met **SIGNER**, één met **ADMIN** → test client-access-rollen.
- Eén ClientUser gekoppeld aan een plan met open constateringen (incl. de kritieke) → test constatering-oplossen + document-ondertekenen.
- Een **verlopen** magic-link en een **al gebruikte** magic-link → test nette foutafhandeling.

---

## J. "Vuile" data-injecties verspreid over alles (foutgok-brandstof)

Zorg dat de volgende strings ergens in tekstvelden voorkomen zodat ze in lijsten, detail én documenten renderen:
- HTML/JS: `<script>alert('x')</script>`, `<img src=x onerror=alert(1)>`
- SQL-achtig: `'; DROP TABLE imp_users;--`
- Unicode/edge: emoji `🔧🚀`, RTL `مرحبا`, CJK `检查`, zero-width space, 5000-teken lorem (raakt `DESCRIPTION_MAX_LENGTH`), losse `—`/quotes.
- Getallen: `-1`, `0`, `999999999`, `1,5` vs `1.5`, `1e9`, `NaN`, `Infinity` (in numerieke velden proberen).
- Datums: `31-02-2026` (ongeldig), verre toekomst `01-01-2999`, verleden `01-01-1900`.

Elke injectie moet **veilig geëscaped** worden weergegeven (geen alert, geen layout-breuk) — dit is een expliciet orakel.
