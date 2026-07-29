# Claude Code-prompt — deploy-hardening vóór de release

> Plak alles onder de streep in Claude Code, vanuit `~/VIBE/InspeXi-Beheer`.
> Basis: `origin/dev` (Beheer) — beide repo's zijn schoon, geen open branches.
> **Werk niet op `dev`**: maak per onderdeel een eigen branch.

---

Het deploy-runbook (`docs/herstelplan/RUNBOOK-DEPLOY.md`) is compleet, maar drie stappen zijn fragiel: ze leunen op handwerk zonder vangnet. Deze opdracht maakt ze robuust vóórdat ze onder tijdsdruk worden uitgevoerd. Drie onafhankelijke onderdelen, elk een eigen branch en PR.

## H1 · Rollback-scenario uitschrijven (branch `docs/runbook-rollback`)

Het runbook beschrijft de heenweg volledig en de terugweg **helemaal niet** — `git grep -i "rollback\|terugrol\|downtime"` op het bestand geeft nul treffers. Dat is hier extra riskant omdat terugrollen niet symmetrisch is.

Zoek eerst zelf uit hoe de afhankelijkheden liggen, dan pas schrijven. Wat je moet uitzoeken en vastleggen:

1. **Sync-contract v4 maakt de rollback asymmetrisch.** De PWA gate't hard op `CONTRACT_VERSION` (zie `pull.ts` in `../Inspexi-App`) en de API levert v4 (`sync-mapper.ts`). Rol je de API terug naar v3 terwijl de PWA v4 draait, dan blokkeert elke sync fail-closed. Andersom net zo. Bepaal wat dat betekent voor de volgorde van terugrollen, en of er een venster is waarin inspecteurs offline doorwerken zonder te kunnen syncen.
2. **Twee datamigraties zijn niet triviaal omkeerbaar**: `20260728061433` (D1, `synced_at = updated_at`-backfill + `org_id` op `imp_sync_queue`) en `20260728100000` (D2, canonicalisatie van `measurement_sheet_records.data`). Beschrijf per migratie: wat is puur additief (schema terugdraaien = veilig), wat overschrijft bestaande data (terugdraaien = dataverlies), en of een `prisma migrate resolve --rolled-back` hier überhaupt zinvol is. **Schrijf geen down-migraties** zonder overleg — beschrijf de situatie en de opties.
3. **Wat is wél veilig terug te rollen**: de portal- en client-portal-builds zijn stateless en kunnen los terug. Benoem dat expliciet, want dat is de goedkope escape voor UI-regressies.
4. **Downtime en volgorde**: het runbook zegt "API vóór PWA" maar noemt geen onderhoudsvenster. Schat in of de migraties lock-tijd veroorzaken (D1 raakt 7 tabellen) en of er een moment is waarop de API draait tegen een half-gemigreerde database.
5. **Afbreekcriteria**: bij welke waarneming stop je de deploy en rol je terug, in plaats van vooruit te repareren? Maak dat concreet per stap (bv. post-check 7a geeft > 0 rijen).

Voeg dit toe als nieuwe sectie in `RUNBOOK-DEPLOY.md`, vóór "Beknopte volgorde". Houd het feitelijk: waar je iets niet zeker weet, schrijf je op wat er onderzocht moet worden in plaats van een aanname.

## H2 · API-Dockerfile toevoegen (branch `chore/api-dockerfile`)

`fonts-noto-cjk` is nu een deploy-instructie zonder vangnet: er is **geen `apps/api/Dockerfile`** in de repo, alleen `apps/convert-api/Dockerfile`. Vergeet iemand het font in de image-pipeline, dan verdwijnen CJK-tekens stil uit gegenereerde PDF's (Chromium tekent geen tofu-blokjes) en merk je het pas als een klant belt. Dat is bevinding B-312, en het runbook markeert het zelf als "deploy-afhankelijkheid zonder vangnet".

Maak een `apps/api/Dockerfile` die dit in versiebeheer brengt:

- Neem `apps/convert-api/Dockerfile` als vertrekpunt — die installeert `fonts-noto-cjk` al correct en past bij de bestaande deploy-conventies.
- Chromium voor Puppeteer moet erin, met `PUPPETEER_EXECUTABLE_PATH` gezet (zie `CLAUDE.md` en `pdf-generation.service.ts`).
- Multi-stage: pnpm workspace-install → build → slanke runtime. Let op dat de API afhankelijk is van de workspace-packages (`@inspexi/entitlements`, `@inspexi/calibration`) en van `prisma generate`.
- `NODE_ENV=production` als default in de image (DEP-8), en de Prisma-engine meeleveren.

**Verifieer dat het font echt werkt** in plaats van alleen dat de build slaagt: bouw de image, genereer een PDF met een Chinees teken (bv. via de bestaande documentgeneratie-test of een klein script) en controleer dat het teken in de tekstlaag zit. Dat is precies de check die op macOS misleidend groen geeft.

Werk daarna stap 4 van het runbook bij: van "borg dit buiten de repo" naar "gebruik deze Dockerfile".

## H3 · Dry-run op het skew-script (branch `chore/skew-script-dryrun`)

`apps/api/scripts/backfill-synced-at-skew.ts` is de enige stap die **niet** met `prisma migrate deploy` meekomt en daarmee het makkelijkst te vergeten — het runbook noemt hem zelf zo. Hij heeft nu geen dry-run.

- Voeg een `--dry-run`-vlag toe die telt en rapporteert hoeveel rijen per tabel geraakt zouden worden, zonder te schrijven.
- Laat de normale run aan het eind een samenvatting printen (per tabel: aantal aangepast) zodat de uitvoerder iets in het logboek kan plakken.
- Maak hem aantoonbaar idempotent: twee keer draaien moet de tweede keer 0 rijen raken. Voeg een testje toe als dat redelijk kan.
- Neem in het runbook bij stap 2 een verificatiequery op die ná de run bevestigt dat de skew weg is.

## Volgorde en scope

H1 is docs-only en kan meteen. H2 is het meeste werk en moet in dezelfde release als de C4-code (anders werkt het lokaal wél en in productie niet). H3 is klein.

**Buiten scope**: de deploy zelf niet uitvoeren, en geen productiedata aanraken. De read-only datachecks staan klaar in `docs/herstelplan/DATACHECKS-vooraf.sql` en worden door de eigenaar gedraaid.

## Rapporteer terug

Per onderdeel: wat je hebt gemaakt, wat je hebt geverifieerd (met name: werkt het CJK-font echt in de gebouwde image?), en welke vragen uit H1 je níet kon beantwoorden zonder kennis van de hostingomgeving.
