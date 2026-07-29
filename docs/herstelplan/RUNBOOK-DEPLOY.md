# Runbook — productie-deploy herstelprogramma

> Geconsolideerde pre-deploy-checklist (audit `voortgang/AUDIT-onafhankelijk.md` §7.4; dicht de
> gaten §5.2 en §5.6). Dit document bundelt de stappen die verspreid stonden over
> `00-herstelplan.md` §8, `voortgang/restrisico.md`, `docs/fase3/FASE3-SYNC.md` §10/§11,
> `docs/fase4/FASE4-DOCGEN.md` en de PR-bodies van #136, #144, #153, #165 en #167.
>
> **De volgorde hieronder is strikt.** Elke stap verwijst naar zijn bron.

---

## Stap 1 — Databasemigraties: `prisma migrate deploy`

Vanuit `apps/api/`, tegen de productie-database, **vóórdat de nieuwe API-image live gaat**:

```bash
cd apps/api && npx prisma migrate deploy
```

Deze run bevat onder meer twee verplichte datamigraties uit golf 4:

| Migratie | Wat | Bron |
|---|---|---|
| `20260728061433_wp_d1_sync_queue_org_backfill_synced_at` | D1-backfill (besluit A1): `synced_at = updated_at WHERE synced_at IS NULL` op alle zeven sync-tabellen + `org_id` op `imp_sync_queue`. Zonder deze backfill geeft het fail-closed-conflictgedrag een conflictgolf | PR #165, `FASE3-SYNC.md` §10.4 |
| `20260728100000_canonicalize_sheet_record_data` | D2-datamigratie (besluit A2): legacy `sections`-wrapper in `MeasurementSheetRecord.data` (+ openstaande sync-queue-conflicten) omzetten naar de canonieke servervorm; idempotent | PR #167, `FASE3-SYNC.md` §11.3 |

> Migraties draaien **altijd vanuit `apps/api/`** en **nooit** via `prisma db push` (zie `CLAUDE.md`).

## Stap 2 — HANDMATIG: `backfill-synced-at-skew.ts` draaien

**Dit is het makkelijkst te vergeten punt (audit §5.2): dit script komt NIET mee met
`migrate deploy`.** Het repareert de ms-skew tussen `synced_at` en `updated_at` op rijen waar
`synced_at` al gevuld was (de D1-migratie uit stap 1 raakt alleen NULL-rijen). Zonder deze reparatie
geeft elke ooit gepushte rij bij de eerstvolgende edit vanaf een vers apparaat een vals zelf-conflict.

Eerst een dry-run (telt alleen, schrijft niets), dan de echte run; de echte run print aan het eind
een per-tabel-samenvatting — **plak die in het logboek**:

```bash
cd apps/api && npx ts-node scripts/backfill-synced-at-skew.ts --dry-run
```

```bash
cd apps/api && npx ts-node scripts/backfill-synced-at-skew.ts
```

Het script is idempotent en veilig (zet `synced_at = updated_at`, uitsluitend op rijen waar beide
gevuld en ongelijk zijn); een tweede run raakt aantoonbaar 0 rijen
(`test/backfill-synced-at-skew.e2e-spec.ts`). Bron: PR #144 (skew-fix + script), PR #165
(verhouding tot de D1-backfill), `voortgang/restrisico.md` (rij "syncedAt-skew").

**Verificatie ná de run** — de skew moet weg zijn. Snelste check: de dry-run nogmaals draaien →
samenvatting `0 rijen`. Of per tabel in SQL (herhaal voor de zeven sync-tabellen; elke query → 0):

```sql
SELECT count(*) FROM imp_inspection_plans
WHERE synced_at IS NOT NULL AND synced_at <> updated_at;
```

## Stap 3 — Datachecks op de productie-database

Uit `00-herstelplan.md` §8 en de PR-bodies. Alle checks zijn read-only; alleen bij treffers is
handwerk nodig — en dat handwerk moet af zijn **vóórdat de nieuwe API-image live gaat**.

### 3a. SVG-logo's converteren vóórdat de upload-whitelist dichtgaat (WP-B4, B-507 — PR #136)

```sql
SELECT id, slug, logo_url FROM imp_organizations WHERE logo_url LIKE '%.svg';
```

Staat er iets in: converteer die logo's naar PNG en upload ze opnieuw **vóórdat** de SVG-whitelist
dichtgaat. Zonder conversie blijft de organisatie werken, maar toont het logo als gebroken afbeelding
(de bytes gaan er bewust als `application/octet-stream` uit — als SVG zou het uitvoerbaar zijn).
Dezelfde controle is zinvol voor `imp_users.avatar_url`.

### 3b. Ongewilde goedkeuringsdrempel `0` (WP-C5, B-508 — PR #153)

```sql
SELECT id, slug, quote_approval_threshold FROM imp_organizations WHERE quote_approval_threshold = 0;
```

Rijen die hier opduiken kunnen door de oude UI-bug een onbedoelde 0-drempel hebben (= élke offerte
vereist goedkeuring); per org beoordelen (0 kan ook legitiem gekozen zijn) en zo nodig
`UPDATE ... SET quote_approval_threshold = NULL`.

### 3c. Gereserveerde/ongeldige slugs (WP-C5, B-505 — PR #153)

```sql
SELECT slug FROM imp_organizations WHERE slug IN ('mijn','www','api','app','admin','portal','static','assets','cdn','status','docs','help','support','mail','smtp','imap','pop','mx','webmail','ns','ns1','ns2','dns','vpn','ftp','localhost') OR length(slug) > 63 OR length(slug) < 2;
```

Bestaande botsingen vergen een handmatige slug-migratie vóór deze release — de reserved-check
blokkeert anders elke update mét slug van zo'n org.

### 3d. Aanbevolen (niet blokkerend): typedefinities zonder `shortCode` (B-203 — `voortgang/restrisico.md`)

Controleer `AssetTypeDefinition`/`LocationTypeDefinition` op ontbrekende `shortCode` vóór prod —
anders ontstaan nodenummers als `-0033` (zie `docs/testprogramma/bevindingen/B-203.md`).

## Stap 4 — API-image: `fonts-noto-cjk` (en Chromium) — B-312, WP-C4

De Puppeteer/Chromium-image van de API moet **`fonts-noto-cjk`** bevatten. Chromium tekent géén
glyph voor tekens zonder beschikbaar font — de tekens **verdwijnen stil** uit gegenereerde PDF's
(geen tofu-blokjes), bv. Chinese tekens in project-/relatienamen. De render-CSS verwijst sinds WP-C4
expliciet naar `'Noto Sans CJK SC'`. Bron: PR #148, `docs/fase4/FASE4-DOCGEN.md` (kop "Deploy-fonts").

**Gebruik `apps/api/Dockerfile`** — die borgt dit in versiebeheer: multi-stage pnpm-workspace-build
(packages → `prisma generate` → `nest build` → `pnpm deploy`-prod-tree) op een runtime met
`chromium`, **`fonts-noto-cjk`**, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` en
`NODE_ENV=production` als default (stap 6). Bouwen vanuit de **repo-root**:

```bash
docker build -f apps/api/Dockerfile -t inspexi-api .
```

Snelle font-check in de gebouwde image (moet Noto Sans CJK-regels tonen):

```bash
docker run --rm --entrypoint fc-list inspexi-api : family | grep -i "Noto Sans CJK"
```

> Alleen in de echte container-image te testen — op macOS/desktop gedraagt de font-fallback zich
> anders (daar valt Chromium terug op systeemfonts en lijkt alles ten onrechte in orde). De
> Prisma-CLI zit bewust niet in de runtime-image: `migrate deploy` (stap 1) draait vanuit de
> repo-checkout.

Zelfde image-vereiste: Chromium zelf voor Puppeteer-documentgeneratie (zie `CLAUDE.md`) — zit in
dezelfde Dockerfile.

## Stap 5 — PWA uitrollen NÁ de API (sync-contract v4)

Volgorde uit `FASE3-SYNC.md` §10.5/§11.5 en PR #165/#167: **Beheer-API eerst, dan de PWA.**

- De v4-API accepteert in-flight v3-pushes (legacy `syncedAt`-anker, fail-closed zonder anker).
- Een v3-PWA tegen de v4-server blokkeert op de pull-guard ("App bijwerken nodig"); inspecteurs
  werken in het tussenvenster offline door — geen dataverlies.
- De PWA-build activeert bij de eerstvolgende refresh (vite-plugin-pwa).
- WP-D2 zit in dezelfde v4-PWA-build (Dexie v18); een pre-D2-app die de oude sheet-vorm pusht
  krijgt een nette per-record-fout en herstelt zichzelf na de app-update.

## Stap 6 — `NODE_ENV=production` zetten (DEP-8)

De eindrapportage noemde dit al als pre-deploy-item; het stond nog nergens in de docs (audit §5.6).
Er hangen **drie beveiligingen** aan `NODE_ENV`, alle drie geverifieerd in de code:

| # | Beveiliging | Gedrag | Code |
|---|---|---|---|
| 1 | **JWT-secret-uniciteit** | Ontbrekende/placeholder-secrets worden altijd geweigerd, maar de check dat de vier secrets **onderling verschillen** draait alléén bij `NODE_ENV === 'production'` | `apps/api/src/common/config/validate-jwt-secrets.ts:42` (aangeroepen in `main.ts:34`) |
| 2 | **Rate limiting** | De globale throttler wordt bij `NODE_ENV === 'test'` volledig overgeslagen — een omgeving die per ongeluk op `test` blijft staan heeft **géén enkele rate limiting** (ook niet op login/publieke routes) | `apps/api/src/common/guards/app-throttler.guard.ts:11-13` |
| 3 | **Swagger** | `/api/docs` (volledige API-surface, unauthenticated) staat aan tenzij `NODE_ENV === 'production'`; expliciete override kan via `SWAGGER_ENABLED` | `apps/api/src/main.ts:201-204` |

Daarnaast (audit §7.5): de **seed-scripts weigeren bij `NODE_ENV=production`**
(`apps/api/prisma/seed.ts` en `seed-testprogramma.ts`, guard
`apps/api/src/common/config/assert-seed-allowed.ts`) — het hoofdseed-script wist de volledige
database. Bewuste override kan uitsluitend met `FORCE_SEED=1`; `NODE_ENV=test`/`development`/unset
werken ongewijzigd (e2e-flow).

## Stap 7 — Post-checks

Na de deploy, in deze volgorde:

### 7a. D2-datamigratie geland (PR #167 / `FASE3-SYNC.md` §11.5)

```sql
SELECT count(*) FROM imp_measurement_sheet_records WHERE jsonb_typeof(data->'sections') = 'object';
```

→ moet **0** zijn.

### 7b. D1-sanity: versieanker gevuld, geen conflictgolf (PR #165 / `FASE3-SYNC.md` §10.4)

```sql
-- synced_at nergens meer NULL op de zeven sync-tabellen (elke query → 0):
SELECT count(*) FROM imp_inspection_plans          WHERE synced_at IS NULL;
SELECT count(*) FROM imp_asset_nodes               WHERE synced_at IS NULL;
SELECT count(*) FROM imp_findings                  WHERE synced_at IS NULL;
SELECT count(*) FROM imp_visual_inspections        WHERE synced_at IS NULL;
SELECT count(*) FROM imp_measurement_records       WHERE synced_at IS NULL;
SELECT count(*) FROM imp_measurement_sheet_records WHERE synced_at IS NULL;
SELECT count(*) FROM imp_standalone_measurements   WHERE synced_at IS NULL;

-- Conflictrij-sanity: monitor het aantal open conflicten in de dagen na de uitrol.
-- Een plotse piek = ankerprobleem (stap 1/2 niet of half gedraaid):
SELECT count(*) FROM imp_sync_queue WHERE status = 'conflict';
-- en alle queue-rijen dragen een org (nodig voor de pull-envelope):
SELECT count(*) FROM imp_sync_queue WHERE org_id IS NULL;  -- verwacht 0 (op wees-rijen na)
```

### 7c. Health-checks

- API bereikbaar: `GET /api/v1/...` op het productiedomein (met subdomein-Host) → 200-antwoorden
  in de `{ success, data }`-vorm.
- **Swagger dicht:** `GET /api/docs` → geen documentatie (bevestigt `NODE_ENV=production`, stap 6).
- **Throttling actief:** herhaalde snelle login-pogingen geven 429 met NL-melding
  ("Te veel pogingen, probeer later opnieuw") — bevestigt dat de omgeving níet op `test` staat.
- PDF-generatie met een niet-Latijns teken in een naam → teken zichtbaar in de PDF (stap 4).
- PWA: sync-cyclus op een toestel na refresh → pull `contractVersion: 4`, geen valse conflicten.

---

## Rollback-scenario (de terugweg)

> De stappen hierboven beschrijven de heenweg. Terugrollen is **niet symmetrisch**: het
> sync-contract gate't hard aan twee kanten, en twee datamigraties zijn niet (zinvol)
> omkeerbaar. Lees dit **vóór** de deploy, niet pas als het misgaat — de belangrijkste
> conclusie is dat na de cutover **fix-forward bijna altijd de juiste keuze is** en een
> API-terugrol de situatie meestal verergert.

### R1. Sync-contract v4 maakt de rollback asymmetrisch

De PWA-pull-guard eist **gelijkheid** met `CONTRACT_VERSION = 4`
(`ContractVersionMismatchError` in `apps/inspectie-app/src/services/sync/pull.ts`,
Inspexi-App-repo); elke synccyclus begint met de pull, dus bij een mismatch bereikt de
client ook de push nooit. De API serveert `contractVersion: 4`
(`SYNC_CONTRACT_VERSION` in `apps/api/src/modules/sync/sync-mapper.ts`). Gevolgen:

- **API teruggerold (pre-v4) terwijl toestellen de v4-PWA draaien:** élke sync blokkeert
  fail-closed ("App bijwerken nodig"-melding, hoewel het hier andersom is). Inspecteurs
  werken **offline door zonder dataverlies** — lokale wijzigingen blijven pending — maar
  er syncet níets meer tot server en app weer hetzelfde contract spreken.
- **PWA-rollback propageert traag:** de PWA activeert een (oudere óf nieuwere) build pas
  bij de eerstvolgende refresh (vite-plugin-pwa). Je kunt een toestel niet dwingen; een
  API-terugrol laat v4-toestellen dus **voor onbepaalde tijd** geblokkeerd staan.
- **Volgorde van terugrollen** (spiegelbeeld van de heenweg "API vóór PWA"): eerst de
  oude PWA-build terugzetten, dán pas (indien echt nodig) de API — en accepteer dat het
  venster waarin toestellen nog v4 draaien niet door jou wordt bepaald.
- Het offline-doorwerk-venster is veilig (zie `FASE3-SYNC.md` §10.5) zolang het kort
  blijft; hoe langer toestellen niet syncen, hoe groter de kans op echte conflicten bij
  de her-aansluiting.

**Praktische consequentie:** rol de API alléén terug bij een defect dat de API zelf
onbruikbaar maakt (niet booten, dataverminking). Voor al het andere: fix-forward.

### R2. De twee datamigraties: wat is (niet) omkeerbaar

**D1 — `20260728061433` (sync-queue-org + `synced_at`-backfill):**

- *Additief en veilig te laten staan:* de nullable kolom `imp_sync_queue.org_id` + index.
  Oude API-code negeert een extra kolom; terugdraaien van het schema is niet nodig. De
  `org_id`-waarden zijn bovendien herafleidbaar uit `user_id` — dit deel is het enige dat
  desgewenst verliesvrij te reconstrueren is.
- *Feitelijk one-way, maar goedaardig:* de backfill `synced_at = updated_at WHERE
  synced_at IS NULL`. Ná de run is niet meer te onderscheiden welke rijen gebackfilld
  zijn en welke al gevuld waren — "terugzetten naar NULL" kan dus niet selectief. Dat
  hoeft ook niet: pre-D1-code behandelt een gevulde `synced_at` gewoon als pull-basis;
  de backfill laten staan is onder élke rollbackvariant veilig.

**D2 — `20260728100000` (canonicalisatie `measurement_sheet_records.data`):**

- Deze migratie **overschrijft** de legacy `sections`-vorm in-place (records + open
  sync-queue-conflicten); de oorspronkelijke vorm wordt nergens bewaard. Terugdraaien =
  de omgekeerde transformatie uitvoeren, en die is niet uniek (rij-hernummering,
  `rows`/`values`-onderscheid) — **effectief dataverlies**.
- Terugdraaien is óók onnodig: de canonieke vorm was al de server-/portalvorm; de oude
  (pre-D2) API en portal lezen hem gewoon. D2 laten staan is onder elke rollbackvariant
  veilig.

**`prisma migrate resolve --rolled-back`:** dit is **boekhouding, geen rollback** — het
markeert een als *mislukt* geregistreerde migratie zodat `migrate deploy` hem opnieuw
probeert. Beide datamigraties draaien in één transactie: faalt er één, dan is de
database voor díe migratie al automatisch teruggerold en is `resolve --rolled-back` (na
het fixen van de oorzaak) de juiste vervolgstap. Voor een **geslaagde** migratie is het
commando zinloos; er zijn géén down-migraties geschreven (bewust — zie hierboven waarom
ze niet zinvol zijn). Laatste redmiddel bij echte verminking: een database-restore van
de pre-deploy-backup — dat kost álle schrijfacties sinds dat moment en is alleen voor
catastrofes. **Maak dus vóór stap 1 een backup/restorepoint** (nog te borgen: welke
backup-/PITR-voorziening de hostingomgeving precies biedt).

### R3. Wat wél veilig los terug te rollen is

- **Portal- en client-portal-builds zijn stateless** (statische assets): de vorige build
  terugzetten kan per app, los van API en database, zonder datarisico. Dit is de
  **goedkope escape voor UI-regressies** — gebruik die in plaats van een API-terugrol.
- De **API-image** is zelf ook stateless (state in DB + object-storage), maar een oudere
  image herintroduceert het R1-contractprobleem en moet schema-compatibel zijn met de
  reeds gemigreerde database. De migraties van deze release zijn additief dan wel
  goedaardig (R2), maar **controleer dit per toekomstige release opnieuw** voordat je op
  image-terugrol vertrouwt.

### R4. Downtime, locks en het half-gemigreerde venster

- **Lock-profiel D1:** `ADD COLUMN` (nullable, geen default) is metadata-only en
  onmiddellijk. De backfill-UPDATEs nemen rij-locks over de **volledige** zeven
  sync-tabellen + `imp_sync_queue` (join-update); duur ≈ evenredig met het aantal rijen.
  De `CREATE INDEX` op `imp_sync_queue` is niet-`CONCURRENTLY` en blokkeert schrijfacties
  op die tabel voor de duur van de build. Bij de huidige productie-omvang is dit naar
  verwachting seconden-werk, maar **de werkelijke rijaantallen in prod zijn niet bekend
  vanuit de repo** — check ze vooraf (de read-only tellingen kunnen mee in
  `DATACHECKS-vooraf.sql`).
- **Lock-profiel D2:** UPDATEs met een selectieve WHERE (alleen rijen met de
  `sections`-wrapper); plpgsql-transformatie per rij. Zelfde orde van grootte.
- **Het half-gemigreerde venster:** het runbook migreert (stap 1–3) terwijl de **oude**
  API nog live is. Dat is schema-veilig (additief), maar let op één interactie: de oude
  API accepteert legacy-vormige sheet-pushes en kan dus **ná D2 opnieuw**
  `sections`-rijen wegschrijven zolang hij live is. Houd het venster tussen stap 1 en de
  API-cutover kort, en beschouw post-check 7a als hard: bij > 0 de D2-UPDATEs uit de
  migratie eenvoudig herhalen (idempotent).
- **Onderhoudsvenster:** een harde downtime is niet strikt nodig (PWA's werken offline
  door; portal-gebruikers zien hooguit trage writes tijdens de backfill-locks), maar
  plan stap 1 t/m de API-cutover aaneengesloten op een sync-rustig moment en communiceer
  een kort venster. Zo blijft ook het her-vervuilingsvenster van D2 minimaal.

### R5. Afbreekcriteria — wanneer stoppen i.p.v. vooruit repareren

Vóór de API-cutover is afbreken goedkoop (oude API draait nog, migraties zijn veilig te
laten staan); ná de cutover is fix-forward vrijwel altijd beter (R1). Concreet:

| Moment | Waarneming | Besluit |
|---|---|---|
| Stap 1 | `migrate deploy` faalt (transactie automatisch teruggerold) | **Stop.** Oorzaak onderzoeken; oude API blijft live en verdraagt de al toegepaste additieve migraties. Herstart later met `resolve --rolled-back` + nieuwe poging |
| Stap 2 | Skew-script faalt halverwege | **Niet afbreken** — script is idempotent, opnieuw draaien. Wél afbreken als de fout structureel is (bv. connectie/rechten) en niet vóór de cutover op te lossen |
| Stap 3 | Datachecks tonen treffers die niet vóór de cutover op te lossen zijn (bv. slug-botsing 3c) | **Pauzeer de cutover** — de migraties mogen blijven staan; de nieuwe image pas live als het handwerk af is |
| Cutover | Nieuwe API-image boot niet / crash-loopt | **Terug naar de oude image** (veilig: R2/R3). PWA-uitrol (stap 5) uitstellen |
| Stap 7a | Query > 0 rijen | **Niet terugrollen.** Oorzaak = her-vervuiling in het venster (R4) of migratie niet gedraaid; D2-UPDATEs herhalen. De nieuwe API weigert nieuwe legacy-pushes, dus dit convergeert |
| Stap 7b | Piek in `status = 'conflict'` | **Niet terugrollen** — dat vergroot de conflictgolf. Stap 1/2 controleren en het ontbrekende deel alsnog draaien |
| Stap 7c | Swagger open / geen throttling | **Niet terugrollen** — env-fout: `NODE_ENV=production` zetten + herstarten |
| Stap 7c | CJK-teken ontbreekt in PDF | **Niet terugrollen** — image zonder font: image herbouwen mét `fonts-noto-cjk` en opnieuw uitrollen (fix-forward; alleen docgen is geraakt) |
| Stap 7c | Portal-/client-portal-regressie | **Alleen de betreffende frontend-build terugrollen** (R3); API en database blijven staan |
| Ná cutover | Dataverminking in de database zelf | Laatste redmiddel: **restore pre-deploy-backup** — kost alle writes sinds de backup; alleen bij aantoonbare corruptie, in overleg met de eigenaar |

### R6. Open punten (hostingomgeving — vóór de deploy beantwoorden)

Deze vragen zijn niet uit de repo te beantwoorden en horen bij het image-/platformbeheer:

1. Welke **backup-/PITR-voorziening** heeft de productie-database, en hoe lang duurt een
   restore? (Bepalend voor het "laatste redmiddel" in R5.)
2. Blijven **oude image-tags** (API, portal, client-portal) beschikbaar en direct
   herdeploybaar? Zonder bewaarde vorige build is R3 theorie.
3. Welk **sync-contract serveert de huidige productie-API** feitelijk? (Bepaalt of een
   image-terugrol toestellen op v3 of v4 laat aansluiten.)
4. **Rijaantallen** van de zeven sync-tabellen + `imp_sync_queue` in prod (lock-duur R4).

---

## Beknopte volgorde (samenvatting)

1. `prisma migrate deploy` (bevat D1-backfill `20260728061433` + D2-datamigratie `20260728100000`)
2. **Handmatig** `npx ts-node scripts/backfill-synced-at-skew.ts` (komt níet mee met migrate deploy)
3. Datachecks: SVG-logo's (3a), threshold `= 0` (3b), gereserveerde slugs (3c), shortCode (3d, aanbevolen)
4. API-image mét `fonts-noto-cjk` + Chromium (geen Dockerfile in repo — buiten versiebeheer borgen)
5. PWA uitrollen ná de API (contract v4)
6. `NODE_ENV=production` (JWT-uniciteit, throttling, Swagger; seed-guard weigert seeds)
7. Post-checks: D2-query → 0, D1-sanity, health-checks

Gaat er iets mis: zie **Rollback-scenario** hierboven — ná de cutover is fix-forward
vrijwel altijd de juiste keuze; maak vóór stap 1 een database-backup/restorepoint.
