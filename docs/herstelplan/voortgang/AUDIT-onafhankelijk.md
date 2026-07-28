# Onafhankelijke audit van het herstelprogramma

Uitgevoerd 28 juli 2026, ná de eindrapportage "22/22 werkpakketten gemerged". Gecontroleerd is de **code op `origin/dev`** (Beheer `e38beaf`, PWA `336da99`), niet de rapportage. 46 fixes steekproefsgewijs nagelopen, alle 75 bevindingsbestanden op statusdekking, plus branches, testomvang en pre-deploy-administratie.

**Oordeel: het werk is echt en van hoge kwaliteit.** 45 van 46 gecontroleerde fixes zitten aantoonbaar in de code, met schema's, guards, migratie-SQL en tests als bewijs — niet alleen comments. Er is één inhoudelijke overclaim, één niet-gemelde structurele afwijking, en een handvol administratieve gaten.

---

## 1. Bevestigd correct (steekproef van 46 items)

Alle golf-1-fixes (B-101 rolvalidatie + IP-vastlegging, B-102 APPROVERS + SIGNED-guard, B-104 count-gate, B-206/B-207 dataverlies, B-210 autosave, B-401 assetNode), alle golf-2-fixes (referentiecaches, `orgScopeFor`, SVG-whitelist met magic bytes, self-approval-gate met org-flag, race-vrije `sendQuote` via conditionele `updateMany`, `@Max(200)`, publieke select-allowlist, sessie-assign, classificatiemodel uit cache, contentfilter op planstatus), en golf 3–4 (NL-`exceptionFactory`, `RoleRoute`, atomaire magic links, contract v4 met fail-closed anker + backfillmigratie, canoniek sheet-record-schema met idempotente datamigratie, `navigateFallback` + offline-prod-spec).

Twee nuances die de rapportage niet benoemt, beide acceptabel:
- **B-210** is opgelost met debounced autosave + unmount-flush + hydratatie; de "Opslaan"-knop bestaat niet meer. Functioneel sterker dan de bevinding vroeg, maar wel iets anders dan beschreven.
- **B-152** is tenant-gebonden op org-subdomeinen; op het apex/superuser-domein blijft de tokenlookup **bewust** org-onbegrensd (gedocumenteerd in `public-tenant.ts`), omdat gemailde links een generiek `PUBLIC_URL` gebruiken. Een token is daar dus nog opvraagbaar.

**Testomvang klopt.** Statisch geteld op `origin/dev`: API e2e 68 suites / 1119 blokken (claim 1193 — verschil is `.each`-parametrisatie), API unit 141 bestanden / 2232 blokken (claim 2285), portal 364 (claim 373), client-portal 44 (claim 44, exact), PWA Vitest 258 (claim 258, exact), Playwright 6 specs / 9 blokken (claim 8 + offline-prod). `pagination-limit.e2e-spec.ts` bestaat. De suites zijn niet uitvoerbaar in deze sandbox (geen pnpm/Docker/Postgres), dus dit corroboreert de groene run — het bewijst hem niet.

---

## 2. Eén inhoudelijke overclaim: B-105 / WP-C1

**Status in het bevindingsbestand: "opgelost". Feitelijk: deels.**

Het gestelde doel is gehaald — er staat **nul** kale `new ForbiddenException()` in productiecode, en 42 modules gebruiken nu `findFirst + orgScope + assertFound`. Maar het *onderliggende* doel van B-105 (geen existence-oracle op id-routes) is niet af. Er staan nog **15 sites** met `findUnique` + org-vergelijking + 403, verdeeld over vijf modules:

| Bestand | Regels |
|---|---|
| `apps/api/src/modules/documents/documents.service.ts` | 382, 403, 420, 555 |
| `apps/api/src/modules/notes/notes.service.ts` | 221, 270, 301, 330 |
| `apps/api/src/modules/tasks/tasks.service.ts` | 194, 284, 435 |
| `apps/api/src/modules/work-orders/work-orders.service.ts` | 246, 272, 318 |
| `apps/api/src/modules/support-tickets/support-tickets.service.ts` | 122 |

Deze vallen niet onder de gedocumenteerde vrijstelling ("`assert-same-org` bij FK-injectie mag 403 blijven"): het gaat om de entiteit op de route zelf. Een aanvaller kan het bestaan van andermans documenten, notities, taken en werkbonnen nog afleiden. De vijf sites in `organizations.controller.ts` en `support-access.service.ts` zijn wél legitiem (pure `user.orgId !== id`-vergelijking zonder DB-lookup).

**Actie:** zelfde patroon toepassen als in de 42 geconverteerde modules, en de status van B-105 bijstellen tot dat gebeurd is.

---

## 3. Niet-gemelde structurele afwijking: `main` ↔ `dev`

`origin/main` bevat **12 commits die niet in `dev` zitten**, waaronder twee volledige features:

- **PR #124** — PRD-12 AI-agent backoffice, fases 1–4
- **PR #105** — `fix/auth-storage-hardening` (H1/H4/H5/K3)

`dev` loopt 208 commits vóór op `main` maar heeft die 12 nooit binnengehaald. Het hele herstelprogramma is dus geverifieerd tegen een `dev` die de AI-agent-code en de auth/storage-hardening **niet** bevat. Bij een merge `dev → main` ontstaat onvermijdelijk werk, en de interactie tussen de herstelfixes en die twee features is nooit getest — juist relevant omdat WP-C1 (guards, exception filter) en WP-B4 (upload/storage) precies dat terrein raken.

Dit staat nergens in de herstelplandocumentatie. **Behandel dit als eigen taak vóór een release**, niet als merge-detail.

---

## 4. Openstaande branch die géén "chip" is

Van de drie PR's die bewust bij de eigenaar zijn gelaten, is er één **functionele security-hardening**, geen testcode:

`origin/fix/wp-b4-upload-security-sweep` — "extend WP-B4 upload hardening to all remaining upload/serve routes (B-507 follow-up)". Zolang deze niet gemerged is, blijft het B-507-restrisico live: de overige uploadroutes (documents, photos, location-images, certificates) valideren nog op `file.mimetype`, en quote-templates serveert nog SVG authenticated. De rapportage schaart hem onder "chip-PR's" — dat onderschat wat er in zit.

`origin/fix/e2e-requests-quote-leak` is inderdaad testcode en kan zonder haast.

---

## 5. Administratieve gaten

| # | Gat | Ernst |
|---|---|---|
| 1 | **B-208 en B-211 missen een `## Status`-sectie** — het enige harde gat in de 75-dekking. Verklaarbaar: WP-A1 was een PWA-only PR terwijl de bevindingsbestanden in de Beheer-repo leven. Inhoudelijk wél opgelost en browser-geverifieerd. | klein |
| 2 | **Geen geconsolideerde pre-deploy checklist.** Stappen liggen verspreid over `00-herstelplan.md` §8, `restrisico.md`, `docs/fase3/FASE3-SYNC.md`, `docs/fase4/FASE4-DOCGEN.md` en PR-bodies. Grootste risico: **`apps/api/scripts/backfill-synced-at-skew.ts` komt niet mee met `migrate deploy`** en is dus het makkelijkst te vergeten. | **middel** |
| 3 | **`fonts-noto-cjk` is niet in versiebeheer af te dwingen** — de API-image heeft geen Dockerfile in de repo. Tot dat opgelost is blijft B-312 (CJK verdwijnt stil uit PDF's) een deploy-afhankelijkheid zonder vangnet. | middel |
| 4 | **`restrisico.md` is niet volledig**: de open restpunten van B-315 (punten 5, 6, 10), B-511 (§9, §10, §11) en B-407 (`preferredDate` in het verleden) staan er niet in, terwijl de bevindingsbestanden ze als open markeren. Plus een dubbele B-402/B-403-regel en een gebroken tabel bij B-222-legacy. | middel |
| 5 | **`03-beslispunten-backlog.md` §B niet bijgewerkt**: B4 (enumeratiebescherming) is feitelijk al geïmplementeerd via B-511 §3 in WP-C5, maar staat nog als open. B5 is gedeeltelijk afgehandeld (`@MaxLength(1024)` + `javascript:`/`data:`-weigering) zonder dat de regel dat vermeldt. B7 draagt de notitie "verdient een eigen bevinding" — die is nooit aangemaakt. | klein |
| 6 | **`NODE_ENV=production`** staat in de eindrapportage wél als pre-deploy-item, maar **nergens in de docs**. Relevant omdat DEP-8 er drie beveiligingen aan hangt: JWT-uniciteit wordt alleen bij `production` afgedwongen, de throttler wordt bij `test` overgeslagen, Swagger staat alleen bij `production` uit. Een omgeving die op `NODE_ENV=test` blijft heeft géén rate limiting. | middel |
| 7 | **`seed.ts` heeft nog geen productie-guard** (152× `deleteMany` zonder `NODE_ENV`/`FORCE_SEED`-check). Bekende P0 uit `REVIEW-2026-07-AANBEVELINGEN.md`, viel buiten het herstelplan — maar staat wel op dezelfde `dev` die naar productie gaat. | **middel** |
| 8 | `00-herstelplan.md` §1/§2/§7 zijn momentopnames van vóór de uitvoering ("B-104 deels gefixt", "bepaal als eerste actie de basisbranch", "beslispunten blokkeren golf 4"). Cosmetisch. | klein |

---

## 6. Eerlijke eindbalans van de 75

| Categorie | Aantal |
|---|---|
| Volledig opgelost en eenduidig gemarkeerd | 61 |
| Opgelost met expliciet restpunt (B-205, B-223, B-312, B-315, B-407, B-511) | 6 |
| Vervallen als bug — norm herschreven (B-103) | 1 |
| Wacht op eigenaarsbeslispunt (B-220→A5, B-409→A4, B-223a→A3) | 3 |
| Bewust gemitigeerd, echte bouw is epic (B-402, B-403, B-406 deel 2) | 3 |
| **Feitelijk deels, maar als opgelost gemarkeerd (B-105)** | **1** |

De claim "75 bevindingen afgehandeld" is verdedigbaar in de zin van *behandeld en bewust belegd*. "Opgelost" geldt voor 61 volledig en 6 met restpunt; de rest is expliciet en traceerbaar geparkeerd — op B-105 na, dat bijstelling verdient.

---

## 7. Vervolgacties, geprioriteerd

1. **`fix/wp-b4-upload-security-sweep` mergen** — functionele security, geen chip. Tot dan is B-507 niet dicht.
2. **B-105 afmaken**: 15 sites in documents/notes/tasks/work-orders/support-tickets naar `findFirst + orgScope + assertFound`; status bijstellen.
3. **`main` ↔ `dev` uitzoeken** vóór een release: PR #124 (AI-agent) en #105 (auth-hardening) zitten alleen in `main`. Plan een merge + hertest van WP-C1/WP-B4-raakvlakken.
4. **Eén pre-deploy runbook maken** met de strikte volgorde: `prisma migrate deploy` → `backfill-synced-at-skew.ts` (handmatig!) → datachecks (SVG-logo's converteren vóórdat de whitelist dichtgaat, threshold `= 0`, gereserveerde slugs) → API-image mét `fonts-noto-cjk` → PWA ná de API (contract v4) → `NODE_ENV=production` → post-check D2 (`jsonb_typeof(data->'sections')` moet 0 zijn).
5. **`seed.ts` productie-guard** toevoegen — losstaand van het herstelplan, maar het staat op dezelfde branch.
6. **Administratie sluiten**: Status-secties voor B-208/B-211, `restrisico.md` aanvullen met B-315/B-511/B-407 en de twee opmaakfouten repareren, B4 als afgehandeld markeren, B7 als eigen bevinding registreren.
7. **Beslispunten A3, A4, A5** beantwoorden (elk met advies in `03-beslispunten-backlog.md`) zodat B-223a, B-409 en B-220 kunnen worden afgerond.

---

## Status-naloop (bijgehouden door de orkestrator, ná de audit)

> De audit is 28-07 tegen Beheer `e38beaf` uitgevoerd; onderstaande punten zijn daarna afgehandeld. Het document hierboven is verbatim het auditrapport.

| §7-punt | Status |
|---|---|
| 1 — upload-sweep mergen | ✅ 28-07: PR #164 gemerged (door eigenaar); hercontrole gecombineerde stand groen (build 6/6 · unit 2285 · e2e 1210/69) — B-507-restrisico dicht |
| 2 — B-105 afmaken | ✅ 28-07: PR #171 — 17 plekken (16 + 1 extra in `support-tickets.update()`) naar `findFirst + orgScope + assertFound`; oracle-tabel in `error-contract.e2e-spec` naar 18 modules; live byte-identiek curl-bewijs; `B-105.md` bijgesteld |
| 3 — `main` ↔ `dev` | ✅ 28-07: onderzocht — PR #105 zit inhoudelijk volledig op `dev` (PR #116, file-niveau geverifieerd); alleen PR #124 (AI-agent backoffice, 55 bestanden/+4438) is écht main-only; proef-merge gaf 23 conflictpaden + een dubbele `password_changed_at`-migratie; geadviseerd pad: #124 eerst via eigen PR naar `dev` + hertest, daarna release-merge — zie `MAIN-DEV-ANALYSE.md` |
| 4 — pre-deploy runbook | ✅ 28-07: PR #175 — `docs/herstelplan/RUNBOOK-DEPLOY.md`: geconsolideerde checklist in strikte volgorde (migrate deploy incl. D1/D2 → handmatig `backfill-synced-at-skew.ts` → datachecks → `fonts-noto-cjk`-image (geen Dockerfile in repo, buiten versiebeheer borgen) → PWA ná API → `NODE_ENV=production` met DEP-8-codeverwijzingen → post-checks D2/D1/health) |
| 5 — seed-guard | ✅ 28-07: PR #175 — `assertSeedAllowed()` in `seed.ts` + `seed-testprogramma.ts` vóór elke DB-actie; weigert `NODE_ENV=production` tenzij `FORCE_SEED=1` (NL-melding), test/dev/unset ongewijzigd; unit-spec + bewezen-weigerende productierun |
| 6 — administratie | ✅ 28-07: PR #175 — Status-secties B-208/B-211; restrisico aangevuld (B-315 5/6/10, B-511 §9–§11, B-407 preferredDate) + dubbele B-402/B-403-rij en B-222-legacy-tabel gerepareerd; backlog-B4 afgehandeld, B5-notitie, B7 → nieuwe bevinding **B-413** (contact-brede ClientAccess) |
| 7 — beslispunten A3/A4/A5 | ✅ 28-07: alle drie besloten (advies overgenomen) én geïmplementeerd — A3+A5 in InspeXi #40 (eerlijke "Toegewezen"-labeling; uitlog-waarschuwing + actiegerichte offline-melding, INS-38 herschreven), A4 in PR #176 (herstelverklaring-indicator bij de constatering) — alle drie live browser-geverifieerd door de orkestrator |
