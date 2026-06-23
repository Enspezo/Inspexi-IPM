# PRD-09 SaaS Abonnementen — Fase 4 oplever-notitie

> Status: **Opgeleverd** · Datum: 2026-06-23 · Branch: `feat/saas-entitlements-fase4`
> Scope: seed-varianten (PRD §7.1) + end-to-end-validatie van de testmatrix (PRD §7.3).
> Voorgaande fasen: Fase 0 (catalogus + datamodel + resolver, #74), Fase 1 (backend `FeatureGuard`, #75), Fase 2 (frontend gating portal + client-portal, #76), Fase 3 (SUPERUSER-beheer-UI + cache-invalidatie, #77).

## 1. Wat er live staat

### 1.1 Seed-varianten (`apps/api/prisma/seed.ts`)

Naast de bestaande rijke demo-org (`inspexidemo`, plan Compleet) en `testbedrijf` (plan Basis) zet de seed nu **drie dedicated testmatrix-orgs** neer. Elke variant-org krijgt via de herbruikbare helper `seedVariantOrg()` een **volledige, afrondbare basis-keten**: ORG_ADMIN + INSPECTEUR, één relatie + adres + locatie, één project, één inspectieplan met asset + 2 findings (waarvan één C2-geclassificeerd), plus de **klantportaal-keten** (ClientUser → relatie-toegang → plan-toegang inzien/ondertekenen → vaste magic-link → ondertekenbaar PLAN-document met inspecteur getekend + klant PENDING).

| Org | Slug | Plan | Effectieve features | Bijzonder |
|---|---|---|---|---|
| InspeXi Basis | `inspexibasis` | **Basis** | `BASIS_CRM`, `BASIS_UITVOERING`, `BASIS_INSPECTIES`, `BASIS_WORKFLOW` | Compleet-functies geblokkeerd; basis-keten + klantportaal rond |
| InspeXi Compleet | `inspexicompleet` | **Compleet** | alle 9 (incl. add-ons `WEBHOOKS` + `CUSTOM_FIELDS`) | Alles toegankelijk |
| InspeXi Mix | `inspeximix` | **Basis** + override `WORKFLOW_COMPLEET=true` | 4 basis + `WORKFLOW_COMPLEET` | `/documents` bijgeschakeld; +1 DMS-document; `/quotes` blijft 🚫 |

**Inloggen** (wachtwoord `Password123!`): `admin@inspexibasis.nl`, `admin@inspexicompleet.nl`, `admin@inspeximix.nl` (+ `inspecteur@…` per org).

**Klantportaal magic-links** (directe login, geen wachtwoord):
- `http://inspexibasis.localhost:5174/magic/basis-klant-magic`
- `http://inspexicompleet.localhost:5174/magic/compleet-klant-magic`
- `http://inspeximix.localhost:5174/magic/mix-klant-magic`

De inspectie-config (template, checklist, classificatiemodel, asset-/locatietypes) is globaal en wordt door alle orgs hergebruikt; alleen de org-eigen keten-data wordt per variant geseed. De cleanup-volgorde bovenin de seed dekte deze modellen al — geen wijziging nodig.

> **Reseed-gotcha (CLAUDE.md):** `pnpm db:seed` wist en herseed't de hele DB incl. users → opnieuw inloggen. De API houdt daarna tot 5 min een stale tenant-/entitlements-cache vóór reeds-bekende slugs; herstart de API bij "org niet gevonden". De drie variant-slugs zijn nieuw, dus die hebben geen stale entry.

### 1.2 Validatie-resultaten

| Gate | Commando | Resultaat |
|---|---|---|
| Seed | `pnpm db:seed` | ✅ 3 variant-orgs + 2 plannen, **geen FK-fouten** |
| Build | `npx turbo run build` | ✅ 4/4 tasks |
| Unit | `pnpm test` | ✅ API 1273/1273 (83 suites) + portal Vitest |
| E2E | `pnpm test:e2e` | ✅ 707/707 (47 suites), incl. `feature-entitlements.e2e-spec.ts` |

De error-regels in de test-output (VIES onbereikbaar, "DB error/DB down", `/custom-fields` 500 bij SUPERUSER zonder orgId) zijn **bewuste negatieve-pad-tests** binnen suites die slagen.

## 2. Testmatrix (PRD §7.3) — resultaat per variant

Geverifieerd via (a) **e2e** `feature-entitlements.e2e-spec.ts` (eigen `e2efeat*`-fixtures), en (b) **live-API curl-smoketest** tegen de daadwerkelijk geseede orgs (`:3001`, juiste `Host`-header per subdomein). Rijen die de browser-UI/klantportaal-flow betreffen zijn gemarkeerd **[browser]** — uit te voeren via de stappen in §3 (de Claude Preview-tool is voor dit project uitgeschakeld; data + magic-links staan klaar).

| Scenario | `inspexibasis` | `inspexicompleet` | Hoe geverifieerd |
|---|---|---|---|
| `/contacts`, `/projects`, `/inspection-plans`, `/notes`, `/tasks`, `/favorites` | ✅ 200 | ✅ 200 | curl + e2e |
| `/quotes`, `/requests`, `/customer-groups`, `/products`, `/price-tables` | ✅ 🚫 403 `FEATURE_NOT_IN_PLAN` | ✅ 200 | curl + e2e |
| `/planning`, `/work-orders` | ✅ 🚫 403 | ✅ 200 | curl + e2e |
| `/documents` (DMS) | ✅ 🚫 403 | ✅ 200 | curl + e2e |
| `GET /organizations/me/features` | ✅ 4 basis-keys | ✅ 9 keys (incl. add-ons) | curl + e2e |
| SUPERUSER bypass op gegate route | ✅ geen 403 | n.v.t. | e2e |
| Sidebar verbergt gegate items | **[browser]** Offertes/Planning/Documenten weg | **[browser]** alles zichtbaar | Fase 2 + `sidebar-feature-filter.test.ts` |
| Deeplink/refresh op gegate route | **[browser]** toont `FeatureNotInPlanPage` | n.v.t. | Fase 2 (`FeatureRoute`) |
| Basis-keten end-to-end (relatie→project→plan→asset+finding→rapport→ondertekenen) | **[browser]** data geseed, keten rond | ✅ | seed + browser |
| Klantportaal (magic-link→inzien→oplossen+foto→ondertekenen→verzoek) | **[browser]** magic-link geseed | ✅ | seed + browser |
| Override-org `inspeximix`: `/documents` ✅ terwijl `/quotes` 🚫 | n.v.t. | n.v.t. | curl: `/documents` 200, `/quotes` 403 |
| Dependency-closure: SUPERUSER zet `BASIS_CRM` uit | **[browser]** UI waarschuwt; closure houdt CRM aan | n.v.t. | Fase 3 UI + `entitlements.service.spec.ts` (closure-unit) |

**Curl-smoketest samengevat:** Basis → `me/features` = `[BASIS_CRM, BASIS_INSPECTIES, BASIS_UITVOERING, BASIS_WORKFLOW]`, alle 6 basis-routes 200, alle 8 Compleet-routes 403 `FEATURE_NOT_IN_PLAN`. Compleet → 9 keys, elke route 200. Mix → `[…4 basis…, WORKFLOW_COMPLEET]`, `/documents` 200, `/quotes` 403.

## 3. Handmatige browser-smoketest (resterende [browser]-rijen)

De backend-gating en feature-resolutie zijn volledig geautomatiseerd geverifieerd; de onderstaande stappen dekken de frontend-/portaal-rijen die een echte browser vereisen.

**Portal (`:5173`)**
1. Login `admin@inspexibasis.nl` op `http://inspexibasis.localhost:5173` → sidebar toont géén Offertes/Aanvragen/Producten/Prijstabellen/Planning/Werkbonnen/Documenten.
2. Deeplink `http://inspexibasis.localhost:5173/quotes` (en refresh) → `FeatureNotInPlanPage` ("Deze functie zit niet in uw abonnement"), geen crash/lege pagina.
3. Login `admin@inspexicompleet.nl` op `http://inspexicompleet.localhost:5173` → alle nav-items zichtbaar; `/quotes`, `/planning`, `/documents` openen normaal.
4. Login `admin@inspeximix.nl` op `http://inspeximix.localhost:5173` → `/documents` zichtbaar + opent (toont het geseede DMS-document); `/quotes` blijft de "niet in abonnement"-pagina.
5. Basis-keten (org `inspexibasis`): open het inspectieplan → tab Documenten → genereer/bekijk het PLAN-document → onderteken-flow.
6. SUPERUSER op `http://mijn.localhost:5173` → Organisaties → InspeXi Basis → tab Abonnement → zet `BASIS_CRM` uit → UI **waarschuwt** dat de afhankelijkheid (Inspecties/Projecten) CRM aanhoudt (closure).

**Client-portal (`:5174`)** — voor elke variant via de magic-link uit §1.1:
inspectie inzien → constatering "Ontbrekende afdekking…" oplossen + foto → PLAN-document ondertekenen → vervolgverzoek indienen. Bewijst dat het klantportaal **volledig op `BASIS_INSPECTIES` draait** (ook de Basis-org is rond).

## 4. Wat naar later schuift

| Onderwerp | Status | Toelichting |
|---|---|---|
| **Mix-/extra plan-templates** | Uitgesteld (commercieel besloten, PRD §8) | Nu alleen "Basis" en "Compleet" als `Plan`-records. Extra templates ("Inspecties Only", branche-pakketten) zijn later toe te voegen als losse `Plan`-rijen via de Fase 3-UI — **geen codewijziging nodig**. De per-org `OrganizationFeature`-override (zoals `inspeximix`) dekt nu al maatwerk per klant. |
| **Add-on-prijzen** | Uitgesteld | `WEBHOOKS` en `CUSTOM_FIELDS` zijn functioneel (toggelbaar per plan/org), maar er is nog **geen prijs-/facturatiemodel** aan plannen of add-ons gekoppeld. Hoort bij PRD-08 (Facturatie). De entitlement-laag blijft prijs-agnostisch. |
| **Downgrade-export-UI** | Uitgesteld | PRD §5.4: bij downgrade blijft data behouden + ontoegankelijk via de reguliere UI/API (403). Het backend-principe staat; een expliciet **export-/inzage-pad** (`@AllowDowngradedExport()`, SUPERUSER/expliciete org-toestemming, altijd ge-audit-logd) en de bijbehorende UI zijn nog **niet** gebouwd. Tot die tijd: heractivatie maakt data direct weer zichtbaar (geen migratie nodig). |

## 5. Definition of Done — afgevinkt

- [x] `pnpm db:seed` zet de drie orgs + plannen neer **zonder FK-fouten**.
- [x] §7.3-matrix: Basis blokkeert Compleet-functies (UI-pagina via Fase 2 + **API 403** geverifieerd), basis-keten + klantportaal-data rond; Compleet overal toegankelijk; override-org toont `/documents`; `GET /organizations/me/features` geeft **4 vs 9** keys.
- [x] `npx turbo run build` + `pnpm test` + `pnpm test:e2e` groen.
