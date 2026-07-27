# Herstelplan — 75 bevindingen uit het autonome testprogramma

> Bron: `docs/testprogramma/bevindingen/` op branch **`test/smoke-programma`** (run 27 juli 2026, 260 testgevallen, 202 PASS / 53 FAIL).
> Doel: alle bevindingen **zelfstandig door Claude Code** laten oplossen, opgeknipt in werkpakketten met een eigen branch/PR, in drie golven + een gecoördineerd contract-spoor.

---

## 1. Uitgangssituatie

| | |
|---|---|
| Bevindingen | **75** — 5× S1, 28× S2, 37× S3, 5× S4 |
| NO-GO-risicogebieden | **5 van 11**: R2 (offertes), R4 (sync), R5 (autorisatie), R8 (documenten), R10 (onboarding) |
| Repo's | `InspeXi-Beheer` (API, portal, client-portal) + `Inspexi-App` (PWA) |
| Getest tegen | `dev @ ba7d9bb` (Beheer) en `origin/dev @ bdc77eb` (PWA) |
| Geverifieerd | Alle 75 bevindingen zijn opnieuw tegen de actuele code gecontroleerd. **Eén is deels gefixt** (B-104: `SIGNED`/`FINALIZED` wordt inmiddels geblokkeerd, `PENDING_SIGNATURES` nog niet). De rest is live. |

### Het patroon achter de bevindingen

De backend-businesslogica is sterk: statusmachines, tenantisolatie, FK-validatie, de vier-ogen-gate, first-wins-claims en de beschikbaarheidsresolutie doen precies wat het ontwerp belooft. Vrijwel alle problemen zitten in vier andere lagen:

1. **Rolafscherming rond documenten** — één module (`generated-documents`) gebruikt `ALL_STAFF` waar de rest fijnmazige rolsets hanteert → 4 van de zwaarste bevindingen.
2. **De PWA-sync-mapper** — twee veldfouten maken de kernfunctie onbruikbaar, en de foutafhandeling verbergt het.
3. **Contractdrift tussen lagen** — portal vraagt `limit=200` waar de API op 100 aftopt (25+ schermen), client-portal gebruikt nog `finding.asset` na de AssetNode-migratie, PWA-referentiecaches lezen een verkeerde responsevorm.
4. **Halve implementaties** — klantzijde gebouwd, stafzijde nooit (berichten, verzoeken, tekenrecht).

Daaruit volgt de belangrijkste volgorde-keuze van dit plan: **zichtbaarheid en contractvangnetten eerst**, dan pas de losse fixes. Zolang een mislukte sync stil blijft (B-211) of een gefaalde dropdown-query leeg rendert (B-305), herhaalt deze klasse fouten zich bij de volgende wijziging.

---

## 2. Genomen beslissingen (eigenaar, 27 juli 2026)

| # | Beslispunt | Keuze | Gevolg voor het plan |
|---|---|---|---|
| D1 | Ontbrekende stafzijde (B-402, B-403, B-406-deel-2) | **Mitigeren nu, feature apart** | WP-B9 dicht het lek (geen valse bevestiging meer, e-mailnotificatie); de echte bouw staat als epic in `03-beslispunten-backlog.md` |
| D2 | SUPERUSER op een org-subdomein | **Subdomein bepaalt de scope** | WP-B3: `orgScopeFor(user, tenant)`; platform-breed alleen op `mijn.*`. Repareert B-503 en B-504 als bijproduct |
| D3 | SVG als logoformaat | **Schrappen + headers harden** | WP-B4: alleen PNG/JPEG/WebP, magic-byte-validatie, `nosniff`/CSP/`Content-Disposition`, helmet. **Migratie nodig voor bestaande SVG-logo's** |
| D4 | Uitvoeringsvorm | **PR per werkpakket, in golven** | 22 werkpakketten, elk eigen branch + PR + tests |

Beslispunten die **nog openstaan** (blokkeren alleen golf 4 en de epics) staan in `03-beslispunten-backlog.md`.

---

## 3. Golfindeling

```
GOLF 1  Blokkerend + force multipliers        4 WP    ~2-3 dagen
GOLF 2  Ernstig (S2)                         10 WP    ~8-10 dagen
GOLF 3  Matig/cosmetisch (S3/S4)              5 WP    ~4-5 dagen
GOLF 4  Gecoördineerd contractwerk            3 WP    ~3-4 dagen  (na stabilisatie golf 1-2)
```

**Golf 1 moet strikt in volgorde** (WP-A1 vóór WP-A2: zonder zichtbare syncfouten is geen enkele volgende PWA-fix betrouwbaar te valideren). Binnen golf 2 en 3 zijn de meeste pakketten parallel uitvoerbaar; de afhankelijkheden staan per pakket in `01-werkpakketten.md`.

### Overzicht werkpakketten

| WP | Titel | Repo | Bevindingen | Sev | Afhankelijk van | Status |
|---|---|---|---|---|---|---|
| **A1** | Sync-fouten zichtbaar maken | PWA | B-211, B-208, B-223b | S2 | — | open |
| **A2** | Dataverlies-stop: findings + meetstaten | PWA | B-210, B-206, B-207, B-223d | **S1** | A1 | open |
| **A3** | Documentketen-integriteit | API | B-101, B-102, B-103, B-104 | **S1** | — | open |
| **A4** | Klantportaal-crash (AssetNode) | client-portal | B-401 | **S1** | — | open |
| **B1** | Referentiedata-sync herstellen | PWA | B-202, B-204, B-205a | S2 | A1 | open |
| **B2** | Assetboom + dode UI | PWA | B-201, B-213, B-214, B-215, B-223c/f/g, B-221 | S2/S3 | B1 | open |
| **B3** | Superuser-scoping & onboarding | API + portal | B-502, B-503, B-504, B-511§1 | S2 | — | open |
| **B4** | Upload-security (logo + avatar) | API | B-507 | S2 | — | open |
| **B5** | Offerte-keten: gate, bedragen, idempotentie | API + portal | B-302, B-303, B-304, B-307, B-308, B-309, B-314, B-315-B | S2 | — | open |
| **B6** | Paginatie-contract + zichtbare queryfouten | API + portal | B-305 | S2 | — | open |
| **B7** | Publieke endpoints: allowlist + tenantbinding | API | B-306, B-152 | S2 | — | open |
| **B8** | Planning: sessies toewijzen (UI) | portal | B-310 | S2 | — | open |
| **B9** | Klantportaal: zichtbaarheid + mitigaties | API + beide portals | B-412, B-402*, B-403*, B-406a | S2/S3 | A4 | open |
| **B10** | Constatering-classificatie uit het model | PWA + API | B-222 | S2 | B1 | open |
| **C1** | Foutcontract: NL-meldingen + 404-oracle | API + portal | B-105, B-106, B-151, B-155, B-501, B-509, B-601 | S3/S4 | — | open |
| **C2** | Klantportaal-hygiëne | API + client-portal | B-404, B-405, B-407, B-408, B-409, B-410, B-411 | S3/S4 | — | open |
| **C3** | Sync-hardening serverzijde | API | B-203, B-212, B-216, B-217, B-218, B-223a | S3 | — | open |
| **C4** | Documentgeneratie + tabeloverflow | API + portal | B-311, B-312, B-301 | S3 | — | open |
| **C5** | Config-validatie & losse rest | API + portal | B-001, B-107, B-153, B-154, B-313, B-315-rest, B-505, B-506, B-508, B-510, B-511 | S3/S4 | — | open |
| **D1** | Sync-versieanker + conflicten in pull | PWA + API | B-209, B-223e | S2 | golf 1-2 stabiel | open |
| **D2** | Canonieke MeasurementSheetRecord-datavorm | PWA + API | B-205b | S2 | A2 | open |
| **D3** | Offline-shell hertest + sessiebeleid | PWA | B-219, B-220 | S3→S1? | — | open |

\* mitigatie, niet de volledige feature (zie D1-beslissing)

---

## 4. Systemische fixes — het meeste rendement per regel

Deze zes ingrepen lossen samen tientallen bevindingen op en voorkomen hele klassen regressie. Ze zijn opzettelijk vroeg in het plan gezet.

| Ingreep | Bestand | Lost op | Voorkomt |
|---|---|---|---|
| `pendingCount` reactief + `lastSyncFailed`-vlag | `SyncContext.tsx` (PWA) | B-208, B-211, B-223b | Elke toekomstige stille sync-breuk |
| `@Max(100)` → `200` op de basis-paginatie-DTO | `common/dto/pagination-query.dto.ts` | B-305 (15 call-sites, 11 bestanden) | — |
| Zichtbare foutstate op gefaalde dropdown-queries | portal query-wrapper | — | De hele klasse "stil lege dropdown" |
| Centrale NL `exceptionFactory` + message-map in de filter | `main.ts` + `http-exception.filter.ts` | B-106, B-155, B-501, B-601, deel B-302/B-314 | ~200 losse `message:`-decorators |
| `orgScopeFor(user, tenant)` | `common/utils/org-scope.ts` | B-502, B-503, B-504 | Elke toekomstige superuser-scopingfout |
| `select`-allowlist + key-snapshot-test op `/public/*` | planning-public, quote-public | B-306, B-152 | Elk toekomstig veldlek op publieke routes |

---

## 5. Regressievangnet (verplicht onderdeel van elke PR)

De testrun legde bloot dat de bestaande testsuite twee blinde vlekken heeft die de S1's mogelijk maakten:

1. **Geen enkele test stuurt een door de PWA-serializer geproduceerde payload naar `/sync/push`.** De bestaande e2e's maken records via REST, waar de routes ontbrekende velden zelf invullen — precies waarom B-206 en B-207 onopgemerkt bleven.
2. **Geen contracttest op de referentie-endpoints** die de PWA consumeert (B-202, B-205).

Daarom bevat het plan twee vaste testinvesteringen, uit te voeren in WP-A2 respectievelijk WP-B1:

- **Sync-contracttestsuite** (Beheer, Jest-e2e): per entiteit een payload zoals de PWA hem serialiseert → `/sync/push` → assert de DB-rij. Dit is het vangnet voor de hele C2-klasse.
- **Referentie-contracttest** (PWA, Vitest/MSW): per referentie-endpoint de echte responsevorm → assert dat de cache gevuld raakt.

Daarnaast per PR: **geen enkele route mag een 500 geven op een geldige body**, en **geen enkel 401/403-antwoord bevat nog Engelse framework-tekst**.

---

## 6. Werkwijze per werkpakket

Elk pakket doorloopt dezelfde cyclus:

1. Branch vanaf de afgesproken basis (zie §7), naam `fix/wp-<code>-<korte-titel>`.
2. Lees de betrokken bevindingsbestanden **volledig** (`docs/testprogramma/bevindingen/B-xxx.md`) — die bevatten reproductiestappen en bewijs.
3. Verifieer de root cause in de actuele code vóór je iets wijzigt; de bevinding kan achterhaald zijn (zoals bij B-104).
4. Implementeer, inclusief de in het pakket genoemde tests.
5. Draai `npx turbo run build`, de unit-tests en de relevante e2e-suite.
6. **Hertest de oorspronkelijke testgevallen** uit `docs/testprogramma/0x-actor-*.md` die aan de bevinding hangen — in de browser, zoals de originele run.
7. Werk het bevindingsbestand bij met een `## Status`-sectie (opgelost / deels / vervallen + PR-verwijzing).
8. PR met: bevindingen-IDs, samenvatting van de root cause, wat er is veranderd, hoe het is geverifieerd, en expliciet de restrisico's.

---

## 7. Branch- en omgevingsstrategie

**Basisbranch.** De bevindingen zijn getest tegen `dev`; de huidige werkbranch is `feat/online-repair`. Bepaal als eerste actie welke van beide de basis wordt (waarschijnlijk `dev` ná het mergen van `feat/online-repair`), en rebase daar alle WP-branches op. Werk dit vast in het uitvoerlogboek.

**Docs-branch.** `test/smoke-programma` bevat de bevindingen en is nog niet gemerged. Merge die branch (of cherry-pick `docs/testprogramma/`) naar de basis vóór golf 1, anders werken de WP-branches met bestanden die er niet zijn.

**PWA.** De PWA leeft in `../Inspexi-App` met een eigen branch en PR per pakket. WP's die beide repo's raken (B10, D1, D2) krijgen **twee** PR's die naar elkaar verwijzen en samen gemerged worden.

**Omgeving.** Zoals in `docs/testprogramma/00-master-testplan.md` §5: API `:3001` (`NODE_ENV=test` voor throttle-vrij testen), portal `:5173`, client-portal `:5174`, PWA `:5176`, Postgres `:5433`. Altijd via subdomein benaderen. Herstart de API na elke seed.

**Seed.** Let op: de testdata bevat bewust ongeldige fixtures die door de nieuwe validaties geraakt worden — `TP-OFF-010` (negatieve prijs, korting 150%, btw 250%) botst met WP-B5, en het globale template `MS-SU17-TEST` (`min 100 / max 0`) botst met WP-C5/B-506. Pas de seed in hetzelfde pakket aan, anders breekt de seed.

---

## 8. Datachecks vóór uitrol naar productie

Drie fixes vragen om een controle op bestaande data. Voer deze uit vóór de betreffende PR live gaat.

| Check | Query / actie | Hoort bij |
|---|---|---|
| Ongewilde goedkeuringsdrempel `0` | `SELECT id, slug, quote_approval_threshold FROM imp_organizations WHERE quote_approval_threshold = 0;` — elke org die ooit een instellingen-tab opsloeg kan stil op 0 staan (= élke offerte vereist goedkeuring) | C5 (B-508) |
| SVG-logo's | `SELECT id, slug, logo_url FROM imp_organizations WHERE logo_url LIKE '%.svg';` — converteren naar PNG vóór de SVG-whitelist dichtgaat | B4 (B-507) |
| Gereserveerde/te lange slugs | `SELECT slug FROM imp_organizations WHERE slug IN ('mijn','www','api','app','admin') OR length(slug) > 63;` | C5 (B-505) |
| `synced_at IS NULL` op assetnodes | Backfill `synced_at = updated_at` vóór het fail-closed-conflictgedrag live gaat, anders ontstaat een conflictgolf | D1 (B-209) |
| Pending PWA-records met foute FK | Dexie-repairhook (v15) op bestaande toestellen: `visualInspectionId` verplaatsen, `templateVersion` invullen | A2 |

---

## 9. Documenten in dit plan

| Bestand | Inhoud |
|---|---|
| `00-herstelplan.md` | Dit document — strategie, golven, systemische fixes, randvoorwaarden |
| `01-werkpakketten.md` | Per werkpakket: bevindingen, root cause, aanpak, acceptatiecriteria, tests |
| `02-START-PROMPT-claude-code.md` | Uitvoerprompt voor Claude Code (orkestrator + subagents) |
| `03-beslispunten-backlog.md` | Openstaande eigenaarsbeslissingen + de drie feature-epics |
