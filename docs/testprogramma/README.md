# InspeXi — Autonoom Testprogramma

Smoke- en verkennend testprogramma, bedoeld om **door Claude Code autonoom in de browser** te worden uitgevoerd in een **eigen git-worktree**, met **gevarieerde seed data** en bewust afwijkende ("domme gebruiker") invoer. Geïnspireerd op TMap (productrisicoanalyse → teststrategie → dekkingstypes → bevindingenbeheer).

## Leesvolgorde
1. **`00-master-testplan.md`** — strategie, PRA, dev-stack, worktree-setup, orakels, faseplan. **Start hier.**
2. **`01-seed-datasets.md`** — specificatie van de variërende testdata (fase 0: als `seed-testprogramma.ts` bouwen).
3. Actor-scripts (uitvoervolgorde = PRA-prioriteit):
   - `05-actor-inspecteur-pwa.md` (INS) — R4 hoogste risico, incl. offline/sync/conflict
   - `07-cross-tenant-security.md` (SEC) — R1/R5 isolatie & autorisatie
   - `04-actor-backoffice.md` (BO) — R2/R3 offerte & review
   - `06-actor-klant-publiek.md` (KL/PUB) — R7 online herstel
   - `02-actor-superuser.md` (SU) · `03-actor-orgadmin.md` (OA) — R10 onboarding/config
4. **`08-bevindingen-template.md`** — logformat + severity (S1–S4).

## Kernpunten voor de uitvoerder
- Apps via **subdomein**: portal `<slug>.localhost:5173`, client-portal `:5174`, PWA `:5176`, superuser `mijn.localhost:5173`. API op **3001**.
- Draai API met **`NODE_ENV=test`** om throttling uit te zetten — behalve bij de expliciete throttle-tests (PUB-15, SEC-19..21).
- Herstart de API **na elke seed** (5 min tenant-cache).
- Log **elk** testgeval (ook PASS) in `bevindingen/logboek.md`; echte afwijkingen als `bevindingen/B-<nr>.md`.
- **Wijk gerust af van het script** wanneer iets verdacht lijkt (verkennend testen), zolang elke afwijking wordt gelogd.

~197 testgevallen. Gerelateerd: `../gouden-paden.html` (visuele workflows per actor).
