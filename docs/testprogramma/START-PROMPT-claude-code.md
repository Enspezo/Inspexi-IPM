# Startprompt voor Claude Code

> Plak alles onder de streep in Claude Code (vanuit de repo-root `InspeXi-Beheer`). De prompt laat de hoofdagent orkestreren en delegeert zoveel mogelijk naar subagents.

---

Je gaat het autonome testprogramma uit `docs/testprogramma/` uitvoeren tegen een lokaal draaiende InspeXi-stack. Lees eerst **`docs/testprogramma/README.md`** en **`docs/testprogramma/00-master-testplan.md`** volledig; die zijn leidend. De PWA-repo staat naast deze repo op `../Inspexi-App`.

Werk als **orkestrator**: jij regelt setup en volgorde, en je delegeert deelwerk naar **subagents** (Task-tool) waar dat kan. Houd een takenlijst bij.

## Harde randvoorwaarden (niet overslaan)
- Werk in een **aparte git-worktree**, niet in de hoofd-checkout. Maak: `git worktree add ../InspeXi-Beheer-test -b test/smoke-programma` (en idem voor de PWA op `../Inspexi-App`). Voer alles daarin uit.
- Apps benaderen via **subdomein**: portal `http://inspexidemo.localhost:5173`, client-portal `:5174`, PWA `http://inspexidemo.localhost:5176`, superuser `http://mijn.localhost:5173`. API op **:3001**.
- Start de API met **`NODE_ENV=test`** (throttling uit). De throttle-testgevallen (PUB-15, SEC-19..21) draai je apart met normale env, of markeer je als "niet getest — reden".
- **Herstart de API na elke seed** (5 min tenant-cache).
- Eén gedeelde Postgres (:5433) en één gedeelde Chrome-sessie: browser-uitvoering is **niet echt parallel**. Zie de parallelisatie-regels hieronder.
- Verzin nooit resultaten. Elk testgeval verifieer je in de echte UI en waar relevant via de netwerk-statuscode (`read_network_requests`) en console (`read_console_messages`).

## Fase 0 — Setup (hoofdagent zelf)
1. Worktrees aanmaken, `pnpm install`, `docker compose up -d`, `pnpm db:migrate`.
2. Poorten vrijmaken: `lsof -ti:3001 -ti:5173 -ti:5174 -ti:5176 | xargs kill -9`.
3. Smoke: laadt elke app zijn loginscherm op de juiste poort/subdomein?

## Fase 1 — Testdata bouwen (parallelle subagents)
De gevarieerde seed is gespecificeerd in `01-seed-datasets.md` maar nog niet geschreven. Splits dit over subagents die **onafhankelijk bestanden/analyse opleveren** (geen gedeelde DB-schrijf tegelijk):
- **Subagent A (schema-analyse):** lees het actuele Prisma-schema + bestaande `seed.ts`/`seed-lookups.ts` en lever de exacte modellen/velden/enum-waarden + de correcte cleanup-volgorde (let op AssetNode RESTRICT-FK's) die het nieuwe seed-script nodig heeft.
- **Subagent B (seed-script):** schrijf op basis daarvan `apps/api/prisma/seed-testprogramma.ts` — idempotent, alle orgs/users/contacten/offertes/plannen/assetbomen/herstel-data uit `01-seed-datasets.md`, met de injectie-/unicode-strings uit §J.
Daarna voert de **hoofdagent** het seed-script sequentieel uit (`SEED_DEMO=1`), start de API met `NODE_ENV=test`, en verifieert met een **subagent C** dat alle verwachte orgs/users/entiteiten bestaan (via Swagger `/api/docs` of Prisma Studio). Pas doorgaan als de testbasis klopt.

## Fase 2 — Uitvoering (subagent per actor-script)
Geef **elke actor zijn eigen subagent**, zodat elk zijn eigen context/persona vasthoudt ("gebruiker die het systeem nog niet kent"). Elke subagent krijgt als opdracht: voer alle testgevallen uit zijn script uit, check het orakel per geval, en schrijf resultaten weg (zie Rapportage).

**Parallelisatie-regels (belangrijk, i.v.m. één browser + één DB):**
- **API-niveau subagents mogen parallel** (gebruiken `fetch`/curl met de juiste `Host`-header, niet de gedeelde browser): het grootste deel van `07-cross-tenant-security.md` (SEC-01..18, cross-tenant en autorisatie) en de puur op statuscodes gerichte negatieve gevallen. Start deze gelijktijdig.
- **Browser-niveau subagents draaien sequentieel** (delen de Chrome-sessie), in PRA-volgorde:
  1. `05-actor-inspecteur-pwa.md` (INS) — R4, incl. offline/sync/conflict
  2. `04-actor-backoffice.md` (BO) — R2/R3
  3. `06-actor-klant-publiek.md` (KL/PUB) — R7
  4. `02-actor-superuser.md` (SU) + `03-actor-orgadmin.md` (OA)
- Lees per subagent de **read-heavy voorbereiding** (validatieregels opzoeken, testids inventariseren) mag alsnog parallel via extra Explore-subagents.
- Voor de **throttle-tests** (PUB-15, SEC-19..21): één aparte subagent-run met de API op normale env, ná de rest.

Geef elke subagent expliciet mee: welk scriptbestand, de dev-URL's/inloggegevens, de orakels uit §3 van het masterplan, en dat hij **mag afwijken van het script** (verkennend testen) zolang elke afwijking gelogd wordt.

## Rapportage (door elke subagent, samengevoegd door de hoofdagent)
Maak `docs/testprogramma/bevindingen/`:
- `logboek.md` — elk testgeval één regel: `ID | PASS/FAIL/BLOCKED/SKIP | opmerking`.
- `B-<nr>.md` per échte afwijking, volgens het sjabloon in `08-bevindingen-template.md` (severity S1–S4, verwacht vs. werkelijk, repro, HTTP/console-bewijs, screenshot in `bevindingen/img/`).
- `SAMENVATTING.md` — tellingen per severity/actor + de go/no-go-tabel per risicogebied uit `07-cross-tenant-security.md`.

Rond elke subagent af met een korte terugkoppeling aan jou (aantallen PASS/FAIL + de zwaarste bevindingen); jij consolideert. Begin met Fase 0 en een takenlijst.
