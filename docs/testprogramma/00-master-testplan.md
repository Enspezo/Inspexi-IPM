# InspeXi — Master Testplan (Smoke & Verkennend, TMap-geïnspireerd)

> **Doel:** een testprogramma dat **Claude Code autonoom in de browser uitvoert** (zonder tussenkomst van een echte gebruiker), met **gevarieerde en wisselende seed data**, per actor, inclusief bewust "domme"/afwijkende invoer. De focus ligt op smoke-dekking van de gouden paden + verkennend testen op de randen (grenswaarden, foutieve invoer, autorisatie, cross-tenant, offline).
>
> **Uitvoering gebeurt in een eigen git-worktree.** Zie §6.

---

## 1. Scope & aanpak (TMap-lens)

Dit plan leent de structuur van **TMap Next / TMap Quality for cross-functional teams**:

| TMap-element | Invulling hier |
|---|---|
| **Testdoelen** | Werken de gouden paden per actor end-to-end? Vangt het systeem afwijkende/foutieve invoer netjes af (geen 500, geen data-corruptie, duidelijke NL-melding)? Blijft multi-tenant isolatie intact? |
| **Productrisicoanalyse (PRA)** | §2 — risico = kans × schade, bepaalt testintensiteit en volgorde. |
| **Teststrategie** | §3 — welke testsoort waar: gouden-pad-smoke (dekking) vs. verkennend/negatief (diepgang) vs. autorisatie/cross-tenant (isolatie). |
| **Dekkingstypes** | Gebruik-gebaseerd (per actor/persona), grenswaarde-analyse (BVA), equivalentieklassen, foutgok ("error guessing" = de "domme gebruiker"), procescyclus (statusflows). |
| **Testinfrastructuur** | §5 (dev-stack) + §6 (worktree) + §7 (seed). |
| **Bevindingenbeheer** | §8 — hoe Claude Code bevindingen logt met severity. |
| **Faseren** | §9 — voorbereiding → inrichten → uitvoeren → afronden. |

**Buiten scope:** performance/load, security-pentest (alleen functionele autorisatie), visuele pixel-regressie, e-mail-deliverability (we controleren dat een mail *getriggerd* wordt via API-respons/notificatie, niet dat 'ie aankomt), betaal/financiële transacties (niet aanwezig).

**Persona-uitgangspunt (belangrijk):** test als een gebruiker die het systeem **nog niet kent**. Verwacht: velden leeglaten, verkeerde volgorde, dubbelklikken, plakken van rare tekens, negatieve/enorme getallen, terug-knop midden in een flow, twee tabs tegelijk, verkeerde bestandstypes uploaden, sessie laten verlopen. Elke "domme" actie moet een **nette afhandeling** geven, geen crash.

---

## 2. Productrisicoanalyse (PRA)

Score = **Kans op fout (K)** × **Schade bij fout (S)**, beide 1–3. Bepaalt testintensiteit (A=zwaar, B=normaal, C=licht).

| # | Risicogebied | K | S | Score | Klasse | Waarom |
|---|---|---|---|---|---|---|
| R1 | Multi-tenant isolatie (org A ziet/muteert org B) | 2 | 3 | 6 | **A** | Datalek tussen klanten; onherstelbaar vertrouwensverlies |
| R2 | Offerte-lifecycle & goedkeuringsgate | 2 | 3 | 6 | **A** | Verkeerd verstuurde/geaccepteerde offerte = juridisch/financieel |
| R3 | Inspectie vier-ogen-review-gate (submit/sync) | 2 | 3 | 6 | **A** | Niet-gereviewd rapport naar klant = compliance-risico |
| R4 | PWA sync & conflictafhandeling (offline→online) | 3 | 3 | 9 | **A** | Kern van de app; dataverlies bij inspecteur in het veld |
| R5 | Autorisatie per rol (INSPECTEUR mag geen CRM muteren) | 2 | 3 | 6 | **A** | Privilege-escalatie |
| R6 | Invoervalidatie / grenswaarden (negatieve prijs, rare postcode) | 3 | 2 | 6 | **B** | Vervuilde data, foute berekeningen |
| R7 | Online herstel (anoniem, first-wins claim) | 2 | 2 | 4 | **B** | Race-condities, enumeratie |
| R8 | Documentgeneratie & ondertekening (PDF/Word) | 2 | 2 | 4 | **B** | Onleesbaar/incompleet rapport |
| R9 | Planning & beschikbaarheid (409 + override) | 2 | 2 | 4 | **B** | Dubbelboeking inspecteur |
| R10 | Onboarding (org aanmaken, uitnodiging) | 1 | 2 | 2 | **C** | Zelden, herstelbaar |
| R11 | Notificaties & e-mailtriggers | 2 | 1 | 2 | **C** | Hinderlijk maar niet kritiek |

**Uitvoervolgorde:** A-klasse eerst (R4, R1, R2, R3, R5), dan B, dan C. Binnen elke actor: gouden pad eerst (smoke), daarna negatief/grens.

---

## 3. Teststrategie per testsoort

1. **Gouden-pad-smoke (dekking):** doorloop de happy path per actor uit `docs/gouden-paden.html`. Doel: "werkt de keten überhaupt met déze seed-variant".
2. **Grenswaarde- & equivalentietests (BVA):** per invoerveld met een grens (min/max/lengte/regex) test net-onder / op / net-boven. Zie de constraint-tabellen in elk actor-script.
3. **Foutgok / "domme gebruiker" (verkennend):** vrije verkenning met bewust foute input. Claude Code mag hier **afwijken van het script** en doorklikken op wat verdacht lijkt — mits elke afwijking als bevinding wordt gelogd.
4. **Statusflow-/procescyclustests:** forceer ongeldige overgangen (offerte versturen vanuit GEACCEPTEERD, plan submitten vanuit draft) → verwacht nette 400, geen statuswijziging.
5. **Autorisatie- & cross-tenant-tests:** zelfde actie met verkeerde rol / andermans org-id → verwacht 403/404, nooit succes.
6. **Concurrency-/dubbelactie-tests:** dubbelklik submit, twee tabs, gelijktijdige repair-claim → verwacht idempotentie / nette 409.

**Orakel (hoe weet Claude Code of iets "goed" is):**
- **Geen 500** en geen witte pagina op geldige én ongeldige invoer.
- Foutmelding is **in het Nederlands**, begrijpelijk, en bij het juiste veld.
- Verwachte HTTP-status matcht de tabel (controleer via DevTools Network of `read_network_requests`).
- Statusovergangen matchen de lifecycles uit `gouden-paden.html`.
- Na een geblokkeerde actie is de data **onveranderd** (verifieer door terug te navigeren/herladen).
- Bij mutaties: het effect is zichtbaar in de UI én overleeft een refresh (persisteert).

---

## 4. Testtechnieken & tooling voor autonome uitvoering

Claude Code test via **Chrome (claude-in-chrome MCP)**: `navigate`, `read_page`/`get_page_text`, `computer` (klikken/typen), `form_input`, `file_upload`, `read_network_requests` (statuscodes verifiëren), `read_console_messages` (JS-errors vangen). Voor offline-simulatie: DevTools/Playwright `context.setOffline(true)` — de PWA luistert op de browser online/offline-events (bevestigd in code).

**Belangrijk voor tenant-resolutie:** benader apps **altijd via het subdomein**, nooit kale `localhost`:
- Portal (staf): `http://<slug>.localhost:5173`
- Client-portal (klant): `http://<slug>.localhost:5174`
- PWA (inspecteur): `http://<slug>.localhost:5176`
- Superuser-portal: `http://mijn.localhost:5173`

**Throttle-valkuil:** de globale rate-limit (120/min) en strengere auth-limieten (login 10/min, repair-lookup 5/min) zijn **actief in dev**, maar worden **uitgeschakeld met `NODE_ENV=test`**. Start de API met `NODE_ENV=test` zodat herhaald testen niet in een 429 loopt — behalve bij de expliciete throttle-testgevallen (SEC-11 e.v.), draai die met normale env of accepteer de 429 als *verwacht* resultaat.

---

## 5. Dev-stack (exacte poorten)

| App | URL (dev) | Poort | Start |
|---|---|---|---|
| API (NestJS) | `http://localhost:3001/api/v1` (Swagger `/api/docs`) | **3001** (`API_PORT` in `.env`) | `pnpm --filter api dev` |
| Portal (staf) | `http://<slug>.localhost:5173` | 5173 | `pnpm --filter portal dev` |
| Client-portal | `http://<slug>.localhost:5174` | 5174 | `pnpm --filter client-portal dev` |
| PWA (aparte repo) | `http://<slug>.localhost:5176` | 5176 (`strictPort`) | `pnpm --filter inspectie-app dev` in `../Inspexi-App` |
| PostgreSQL | `localhost:5433` | 5433 | `docker compose up -d` |

De PWA-proxy `/api` wijst naar `http://localhost:3001` (`VITE_API_PROXY_TARGET`), `changeOrigin:false` (Host-header blijft het subdomein). CORS staat alle `*.localhost`-subdomeinen toe.

**Poortconflict opruimen vóór start:** `lsof -ti:3001 -ti:5173 -ti:5174 -ti:5176 | xargs kill -9`.

---

## 6. Uitvoering in een eigen worktree

Dit testplan is bedoeld om in een **aparte git-worktree** te draaien, zodat testdata/seed-resets de hoofd-checkout niet raken.

```bash
# vanuit /Users/mathijs/VIBE/InspeXi-Beheer
git worktree add ../InspeXi-Beheer-test -b test/smoke-programma
cd ../InspeXi-Beheer-test

# PWA: aparte repo, ook een worktree of gewoon de dev-branch
cd ../Inspexi-App && git worktree add ../Inspexi-App-test -b test/smoke-programma

# Terug in beheer-worktree:
pnpm install
docker compose up -d                 # Postgres 5433 (gedeeld — let op, zie waarschuwing)
```

> ⚠️ **Gedeelde database:** de Postgres draait op één poort (5433). Draai **niet** twee test-runs tegelijk tegen dezelfde DB. Als de worktree een eigen DB moet hebben, geef Postgres in de worktree een andere poort (pas `docker-compose.yml` + `DATABASE_URL` aan naar bv. 5434) vóór `db:migrate`/`db:seed`. Anders: accepteer dat de test-run de gedeelde dev-DB reset.

**Fase 0 — seed-script bouwen (eerste taak van de uitvoerende sessie):**
De gevarieerde testdata is **gespecificeerd** in `01-seed-datasets.md` maar nog **niet als script geschreven** (schema kan gewijzigd zijn). De uitvoerende Claude Code-sessie schrijft eerst `apps/api/prisma/seed-testprogramma.ts` volgens die spec, met een idempotente opzet en de juiste cleanup-volgorde (zie `CLAUDE.md` → "Seed Script Opruimvolgorde", let op de RESTRICT-FK's van AssetNode). Draai vervolgens:

```bash
cd apps/api
SEED_DEMO=1 npx ts-node prisma/seed-testprogramma.ts   # of via een db:seed:test script
# API met throttle uit voor de meeste tests:
NODE_ENV=test API_PORT=3001 pnpm dev
```

Na een seed **API herstarten** (stale tenant-cache van 5 min, zie `CLAUDE.md`).

---

## 7. Seed-strategie (waarom variërend)

De bestaande seed dekt één "nette" demo-org. Dit programma voegt **variatie** toe zodat verschillende code-paden geraakt worden — zie `01-seed-datasets.md` voor de volledige specificatie. Kernideeën:
- **Meerdere orgs** met verschillende feature-plannen (Basis vs Compleet vs Mix-override) → test feature-gating én cross-tenant.
- **Rommelige data**: contacten zonder e-mail, extreem lange namen, rare tekens (emoji, RTL, SQL-/HTML-achtige strings), ontbrekende postcodes, buitenlandse adressen.
- **Randgevallen in bedragen**: offertes met 0-regels, negatieve korting, hoge bedragen die de goedkeuringsdrempel raken.
- **Statusspreiding**: entiteiten in élke status van elke lifecycle (offertes in CONCEPT…VERLOPEN, plannen in draft…completed, sessies NOG_TE_PLANNEN…VERVALLEN).
- **Beschikbaarheid**: inspecteurs met/zonder dienstverband, met blokkades → planning-409 uitlokken.
- **Inspectiedata voor de PWA**: plannen met assetbomen van wisselende diepte, checklists van verschillende normtypes, meetstaat-templates met numerieke grenzen.

---

## 8. Bevindingenbeheer

Claude Code logt elke bevinding in `docs/testprogramma/bevindingen/` (zie `08-bevindingen-template.md`). Per bevinding: ID, testgeval-ID, actor, app, severity, verwacht vs. werkelijk, repro-stappen, HTTP-status/console-fouten, screenshot-verwijzing.

**Severity:**
- **S1 Blokkerend** — crash (500/witte pagina), dataverlies, cross-tenant lek, autorisatie-omzeiling.
- **S2 Ernstig** — gouden pad breekt, verkeerde statusovergang toegestaan, foute berekening.
- **S3 Matig** — validatie ontbreekt maar geen schade (bv. negatieve prijs geaccepteerd), verwarrende/Engelse foutmelding.
- **S4 Cosmetisch** — UI-glitch, typefout, ontbrekende `—`-fallback.

Aan het eind: `bevindingen/SAMENVATTING.md` met tellingen per severity/actor + een go/no-go-oordeel per risicogebied uit §2.

---

## 9. Faseplan (voor de uitvoerende sessie)

1. **Voorbereiding:** worktree + dev-stack draaiend, `NODE_ENV=test`, smoke-check dat elke app op zijn poort laadt (login-scherm zichtbaar).
2. **Inrichten testbasis:** seed-testprogramma-script schrijven en draaien; verifieer dat alle orgs/users/entiteiten uit `01-seed-datasets.md` bestaan (via Swagger of Prisma Studio).
3. **Uitvoeren (per actor, in PRA-volgorde):** `02` t/m `07`. Per testgeval: uitvoeren → orakel checken → bevinding loggen (ook bij PASS kort afvinken in het logboek).
4. **Afronden:** `SAMENVATTING.md`, go/no-go per risicogebied, opruimen (worktree behouden voor herinspectie van bevindingen).

---

## 10. Documentindex

| Bestand | Inhoud | Testgeval-reeks |
|---|---|---|
| `00-master-testplan.md` | Dit document | — |
| `01-seed-datasets.md` | Specificatie gevarieerde seed data | — |
| `02-actor-superuser.md` | Platformbeheer, org-onboarding, inspectie-systeem | SU-xx |
| `03-actor-orgadmin.md` | Org-config, gebruikers, inspectie-config | OA-xx |
| `04-actor-backoffice.md` | CRM, offertes, planning, review, documenten | BO-xx |
| `05-actor-inspecteur-pwa.md` | PWA uitvoering, sync, offline, conflicten | INS-xx |
| `06-actor-klant-publiek.md` | Client-portal + publieke/anonieme flows (offerte, herstel, ondertekenen) | KL-xx / PUB-xx |
| `07-cross-tenant-security.md` | Autorisatie, isolatie, throttling, sessies | SEC-xx |
| `08-bevindingen-template.md` | Logformat + severity | — |

**Totaal testgevallen: ~197** (SU 18, OA 22, BO 53, INS 44, KL 23 + PUB 16, SEC 21).
