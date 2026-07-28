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

```bash
cd apps/api && npx ts-node scripts/backfill-synced-at-skew.ts
```

Het script is idempotent en veilig (zet `synced_at = updated_at`, uitsluitend op rijen waar beide
gevuld en ongelijk zijn). Bron: PR #144 (skew-fix + script), PR #165 (verhouding tot de D1-backfill),
`voortgang/restrisico.md` (rij "syncedAt-skew").

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

> **Let op (audit §5.3): de API heeft géén Dockerfile in deze repo.** Deze vereiste is dus niet in
> versiebeheer af te dwingen en moet buiten de repo om geborgd worden in het image-/deploybeheer
> (de `apps/convert-api`-image installeert `fonts-noto-cjk` al wél in z'n eigen Dockerfile). Alleen
> te testen in de echte container-image — op macOS/desktop gedraagt de font-fallback zich anders.
> Zolang er geen Dockerfile voor de API in de repo staat, blijft dit een deploy-afhankelijkheid
> zonder vangnet: neem hem expliciet op in de image-build-pipeline.

Zelfde image-vereiste: Chromium zelf voor Puppeteer-documentgeneratie (zie `CLAUDE.md`).

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

## Beknopte volgorde (samenvatting)

1. `prisma migrate deploy` (bevat D1-backfill `20260728061433` + D2-datamigratie `20260728100000`)
2. **Handmatig** `npx ts-node scripts/backfill-synced-at-skew.ts` (komt níet mee met migrate deploy)
3. Datachecks: SVG-logo's (3a), threshold `= 0` (3b), gereserveerde slugs (3c), shortCode (3d, aanbevolen)
4. API-image mét `fonts-noto-cjk` + Chromium (geen Dockerfile in repo — buiten versiebeheer borgen)
5. PWA uitrollen ná de API (contract v4)
6. `NODE_ENV=production` (JWT-uniciteit, throttling, Swagger; seed-guard weigert seeds)
7. Post-checks: D2-query → 0, D1-sanity, health-checks
