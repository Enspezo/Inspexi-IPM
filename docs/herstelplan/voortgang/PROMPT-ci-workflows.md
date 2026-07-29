# Claude Code-prompt — CI-workflows voor beide repo's

> Plak alles onder de streep in Claude Code. Werk in **beide** repo's: `~/VIBE/InspeXi-Beheer` en `~/VIBE/Inspexi-App`.
> Beide staan schoon: alle branches gemerged, geen open PR's.

---

Er is in geen van beide repo's een CI-workflow (`.github/workflows` is leeg). Dat is het enige structurele gat dat na het herstelprogramma overblijft, en het is in dit traject twee keer misgegaan: een PR met een rode typecheck belandde ongemerkt op `dev`, en een goedgekeurde PWA-PR bleef dagen ongemerged liggen zonder dat iets erop wees. Bouw een minimale, snelle CI die dat afvangt.

**Werk niet op `dev`** — eigen branch per repo, eigen PR.

## Vóór je begint: drie dingen uitzoeken

Verzin geen configuratie; controleer eerst hoe deze repo's echt in elkaar zitten.

1. **De pnpm-versies verschillen per repo**: Beheer staat op `pnpm@10.7.0`, de PWA op `pnpm@8.15.0` (beide in `package.json` → `packageManager`). Pin de versie **niet** hard in de workflow; gebruik `corepack enable` zodat elke repo z'n eigen veld volgt. Anders breekt er één van de twee.
2. **Typecheckt `turbo build` de frontends wel?** De Beheer-root heeft géén `typecheck`-script; de API doet het impliciet via `nest build`, maar controleer per app of het buildscript `tsc` draait of alleen `vite build` (die slaat typecheck standaard over). Zo niet, dan zegt een groene build níets over types — precies hoe die rode typecheck kon passeren. Voeg in dat geval een root-`typecheck`-script toe en neem het op in de workflow.
3. **Welke suites hebben een database nodig?** De Beheer-e2e (`apps/api/test`, Jest, `maxWorkers: 1`) draait tegen een echte Postgres met migraties en seed. De PWA-Playwright-specs hebben een volledige draaiende stack nodig (API + PWA) en horen dus **niet** in de PR-workflow.

## Wat je bouwt

### Beheer — `.github/workflows/ci.yml`

Trigger: pull requests naar `dev` en `main`, plus pushes naar `dev`.

Job **`build-and-test`** (de snelle poort, moet altijd draaien):
- `corepack enable`, Node 20 (`engines` eist `>=20`), pnpm-store cachen
- `pnpm install --frozen-lockfile`
- `npx turbo run build` — 6 packages
- `pnpm lint`
- `pnpm test` (unit: ~2300 API + 373 portal + 44 client-portal)
- typecheck, als uit punt 2 blijkt dat de build hem niet dekt

Job **`e2e`** (apart, mag langer duren):
- Postgres 15 als service-container, poort mappen naar 5433 zodat de bestaande `DATABASE_URL`-conventie werkt
- `prisma migrate deploy` + seed. **Let op:** de seed heeft een productie-guard (`assert-seed-allowed.ts`) die weigert bij `NODE_ENV=production` — zet `NODE_ENV=test`. Dat is toch al nodig, want `AppThrottlerGuard` slaat rate limiting alleen dan over en de e2e's rekenen daarop.
- `pnpm test:e2e` (68 suites, 1193 tests, serieel)

Loopt de e2e-job te lang voor comfortabel PR-werk, maak hem dan `workflow_dispatch` + nightly en houd `build-and-test` als verplichte check. Meet dat eerst; niet vooraf aannemen.

### PWA — `.github/workflows/ci.yml`

Trigger: pull requests naar `dev`, plus pushes naar `dev`.

Eén job:
- `corepack enable`, Node 20, pnpm-store cachen
- `pnpm install --frozen-lockfile`
- `pnpm build` (shared-package eerst — turbo regelt de volgorde)
- `pnpm typecheck` ← **dit is de check die de regressie uit PR #41 gevangen had**
- `pnpm lint`
- `pnpm test` (Vitest, 258 tests, volledig gemockt met `fake-indexeddb` — geen services nodig)

**Playwright niet in de PR-workflow.** `core-flow.spec.ts` en de andere specs draaien tegen een handmatig gestarte stack (`E2E_BASE_URL` default `http://inspexidemo.localhost:5176`) en de offline-spec tegen een productie-preview. Zet ze desgewenst achter `workflow_dispatch`, maar laat ze een PR niet blokkeren.

## Branch protection (advies in de PR-body, niet zelf instellen)

Schrijf in de PR-body wat er in de GitHub-instellingen moet gebeuren — dat kun je niet vanuit de repo doen:

- Op `dev` én `main`: PR verplicht, directe pushes uit.
- Verplichte status checks: `build-and-test` (Beheer) resp. de PWA-job.
- **"Require branches to be up to date before merging"** aanzetten. Zonder dat kan een groene PR die op een oude basis is gebouwd alsnog een kapotte `dev` opleveren — bij twee repo's met een gedeeld sync-contract is dat een reëel scenario.
- Overweeg één review verplicht te stellen op `main`.

## Verifiëren

Push de branch en **kijk of de run daadwerkelijk groen wordt** — een workflow die niet draait of stil faalt is erger dan geen workflow. Test daarna bewust het faalpad: introduceer lokaal een typefout, push naar een wegwerpbranch, bevestig dat de check rood wordt, en gooi die branch weg.

Werk tot slot `docs/herstelplan/voortgang/logboek.md` bij en haal het CI-punt uit `AUDIT-onafhankelijk.md` §7.

## Rapporteer terug

Wat je hebt gevonden bij de drie uitzoekpunten (met name: typecheckt `turbo build` de frontends?), hoe lang beide workflows draaien, of de faalpad-test rood werd, en welke branch-protection-instellingen de eigenaar nog handmatig moet zetten.
