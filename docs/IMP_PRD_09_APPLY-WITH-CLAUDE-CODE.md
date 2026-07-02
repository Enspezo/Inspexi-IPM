# Toepassen met Claude Code — SaaS Abonnementen & Feature-Flags

Kant-en-klare prompts om **IMP PRD 09** (`docs/IMP_PRD_09_SaaS-Abonnementen.md`) gefaseerd met **Claude Code** in de `InspeXi-Beheer`-repo te bouwen. Elke prompt is copy-paste en heeft **Doel / Lees eerst / Stappen / Constraints / Definition of done**.

---

## 1. Vastgestelde keuzes (leidend — niet heronderhandelen)

- **Plan = template.** Effectieve features van een org = plan-defaults ⊕ per-org-overrides ⊕ dependency-closure.
- **Org-gericht, niet per gebruiker.** Org kan niets zelf wijzigen; alleen SUPERUSER.
- **Onafhankelijke toggles + automatische afhankelijkheden** (bijv. `BASIS_INSPECTIES` ⇒ `BASIS_CRM`).
- **Catalogus in code** (`FEATURE_CATALOG`) = bron-van-waarheid; DB slaat alleen `Plan`/`PlanFeature`/`OrganizationFeature` op.
- **Twee plannen nu:** "Basis" (4 basisfeatures) en "Compleet" (alle 9, incl. add-ons).
- **Add-ons** `WEBHOOKS` + `CUSTOM_FIELDS`: standaard in Compleet, voor Basis los bij te schakelen.
- **Core (nooit gated):** auth, profiel, organisatie-instellingen, gebruikers, zoeken, dashboard, e-mailsjablonen, notificatie-dispatch. **Platform (SUPERUSER, `@Roles` i.p.v. feature-key):** organisaties, foutmeldingen, inspectie-systeem.
- **Downgrade:** data bewaren, ontoegankelijk via gewone UI/API; export-pad (`@AllowDowngradedExport()`, SUPERUSER, geaudit) blijft.
- De volledige route/endpoint→feature-mapping staat in **PRD §2** (beslis-tabel §2.4).

---

## 2. Werkwijze met Claude Code

- Werk **per fase in een aparte sessie**; `/clear` ertussen.
- **Plan-mode (Shift+Tab) aan voor Fase 0** (schema + migratie, hoog risico): eerst plan laten tonen, goedkeuren, dan uitvoeren.
- Branch per fase: `git checkout -b feat/saas-entitlements-faseN`.
- **Commit per fase** met projectpatroon (`feat: ...`, Co-Authored-By Claude).
- Respecteer de repo-gotchas uit `CLAUDE.md`: migraties **vanuit `apps/api/`**, **nooit `db push`**, bouwen met `npx turbo run build`, poorten vrijmaken bij herstart, slug-regex `^[a-z0-9]+$` (**geen hyphens**).
- Guard-volgorde in `app.module.ts`: **Jwt → Roles → Tenant → Feature** (FeatureGuard als laatste).

---

## 3. Prompt A — Fase 0: catalogus + datamodel + resolver  (plan-mode aan)

```
Doel: leg het fundament voor feature-entitlements — zonder gedragsverandering in de bestaande app.

Lees eerst volledig:
- docs/IMP_PRD_09_SaaS-Abonnementen.md (§1 catalogus, §3 afhankelijkheden, §4 datamodel/resolver, §6 Fase 0)
- CLAUDE.md (secties Database, Multi-Tenancy/TenantCacheService, Seed Script Opruimvolgorde,
  "Nieuw Prisma Model Toevoegen", "Audit Trail Uitbreiden")

Stappen:
1. Maak src/modules/entitlements/ met:
   - feature-catalog.ts: FEATURE_KEYS + FEATURE_CATALOG exact uit PRD §4.1 (incl. add-ons
     WEBHOOKS, CUSTOM_FIELDS met dependsOn:[]).
   - entitlements.service.ts: getEnabledFeatures(orgId) volgens het algoritme in PRD §4.3
     (plan-defaults ⊕ overrides ⊕ transitieve dependency-closure), met per-org cache (5 min TTL)
     en invalidatie-hook. Hergebruik het patroon van TenantCacheService.
   - entitlements.module.ts (@Global), registreer in app.module.ts.
2. Prisma (apps/api/prisma/schema.prisma): voeg Plan, PlanFeature, OrganizationFeature toe
   (exact uit PRD §4.2, met @@map imp_plans / imp_plan_features / imp_organization_features) en
   breid Organization uit met planId (nullable FK → Plan) + relaties features/plan.
3. Migratie VANUIT apps/api/: `npx prisma migrate dev --name add-entitlements`. NOOIT db push.
4. Seed (prisma/seed.ts): maak de plannen "Basis" en "Compleet" (PRD §7.2) en koppel de
   BESTAANDE seed-orgs aan een plan (kies welke; standaard: inspexi-demo → Compleet).
   Werk de cleanup-volgorde bij: organizationFeature → planFeature → plan, en plan ná
   de org-loskoppeling (planId nullen of org eerst verwijderen). Houd kinderen-eerst aan.
5. Audit trail: registreer Plan, PlanFeature, OrganizationFeature in AUDITED_MODELS +
   MODEL_TABLE_MAP (prisma.service.ts).
6. Unit tests entitlements.service.spec.ts: (a) plan-only, (b) plan + bijschakel-override,
   (c) plan + afschakel-override, (d) afschakeling die door closure teruggezet wordt,
   (e) cache-invalidatie na een schrijf.

Constraints:
- GEEN enforcement in deze fase — guards/UI nog niet aanraken. De app gedraagt zich identiek.
- Core- en platform-functies komen NIET in de catalogus.
- Beheer-conventies: id/FK @db.Uuid, orgId @map("org_id"), tabellen imp_, {success,data}.

Definition of done:
- `npx prisma validate` slaagt; `npx prisma migrate dev` draait schoon (test met
  `npx prisma migrate reset` op een wegwerp-DB).
- `pnpm db:seed` draait zonder FK-fouten; "Basis" en "Compleet" staan in imp_plans.
- `npx turbo run build` groen; entitlements unit-tests groen.
- Commit: `feat: add entitlements catalog, plan models & resolver (Fase 0)`.
```

---

## 4. Prompt B — Fase 1: backend enforcement

```
Doel: dwing de feature-flags af op de API.

Lees eerst: docs/IMP_PRD_09_SaaS-Abonnementen.md (§2.1-§2.4 mapping + besluiten, §5.1 FeatureGuard,
§5.4 downgrade) en de bestaande guard-keten in app.module.ts.

Stappen:
1. Decorator @RequiresFeature('<KEY>') (src/common/decorators) — accepteert 1 of meer keys.
2. Globale FeatureGuard (src/common/guards), geregistreerd NA TenantGuard (volgorde
   Jwt→Roles→Tenant→Feature). Logica: SUPERUSER → door; anders
   EntitlementsService.getEnabledFeatures(tenant.orgId) en check de vereiste key(s).
   Niet toegekend → 403 { success:false, message:'Deze functie zit niet in uw abonnement',
   code:'FEATURE_NOT_IN_PLAN' }.
3. Annoteer ALLE controllers met hun feature-key volgens PRD §2.3 + de beslis-tabel §2.4.
   Core/platform-controllers krijgen GEEN @RequiresFeature (platform houdt @Roles(SUPERUSER)).
   Publieke/klant-routes (public/quotes→CRM_COMPLEET, public/planning+ical→UITVOERING_COMPLEET,
   client/*+signature-requests→BASIS_INSPECTIES) resolven de org via token/slug en checken
   dezelfde feature.
4. Endpoint GET /organizations/me/features → string[] effectieve keys (voor de frontend).
5. Downgrade-pad: @AllowDowngradedExport() dat de FeatureGuard overslaat (SUPERUSER of expliciete
   org-toestemming) en altijd ge-audit-logd wordt — alleen op read/export-routes (PRD §5.4).
6. E2E: seed/gebruik 1 Basis-org + 1 Compleet-org; verifieer 403 vs 200 (zie DoD).

Constraints:
- Geen enkele core/platform-route mag per ongeluk gated raken (auth, users, organizations,
  search, vat, numbering, email-templates, notificatie-dispatch).
- Add-ons WEBHOOKS/CUSTOM_FIELDS: gewone @RequiresFeature; ze zitten in Compleet, niet in Basis.

Definition of done:
- E2E groen: Basis-org → 403 FEATURE_NOT_IN_PLAN op /quotes, /requests, /planning, /work-orders,
  /documents, /webhooks, /custom-fields; 200 op /contacts, /projects, /inspection-plans, /notes,
  /tasks, /favorites. Compleet-org → overal 200. SUPERUSER → bypass.
- `npx turbo run build` + unit + e2e + cross-tenant groen.
- Commit: `feat: enforce feature entitlements via FeatureGuard (Fase 1)`.
```

---

## 5. Prompt C — Fase 2: frontend gating (portal + client-portal)

```
Doel: toon gated functies netjes als "niet in abonnement" en verberg ze in de navigatie.

Lees eerst: docs/IMP_PRD_09_SaaS-Abonnementen.md (§2.1/§2.2 routes, §5.2) en in de portal:
providers/ (TenantProvider/AuthProvider), App.tsx, components/layout/sidebar.tsx.

Stappen:
1. FeatureProvider (apps/portal én apps/client-portal): haalt bij bootstrap
   GET /api/v1/organizations/me/features op; expose useFeatures()/hasFeature(key).
   Plaats binnen de bestaande providerketen.
2. <FeatureRoute feature="<KEY>"> wrapper + FeatureNotInPlanPage met de tekst:
   "Deze functie zit niet in uw abonnement. Neem contact op met uw beheerder."
   Wrap elke gated route uit PRD §2.1 (portal) en §2.2 (client-portal = BASIS_INSPECTIES).
   De pagina moet ook bij DEEPLINK/refresh verschijnen (niet alleen bij navigatie).
3. sidebar.tsx: breid NavItem/NavChild uit met optioneel feature?-veld; filter items net als
   de bestaande roles-filter (parent verbergen als alle children wegvallen).

Constraints:
- Geen localStorage voor de feature-set (volg AuthProvider: in-memory; herfetch bij refresh).
- Core/platform-items blijven altijd zichtbaar volgens hun bestaande roles-filter.
- Hergebruik bestaande UI-componenten (geen nieuwe libs).

Definition of done:
- Basis-org: Offertes/Aanvragen/Planning/Werkbonnen/Documenten staan NIET in de nav;
  deeplink naar /quotes toont FeatureNotInPlanPage; klantportaal werkt volledig.
- Compleet-org: alles zichtbaar en toegankelijk.
- `npx turbo run build` groen; portal Vitest groen.
- Commit: `feat: gate portal & client-portal routes by entitlements (Fase 2)`.
```

---

## 6. Prompt D — Fase 3: SUPERUSER-beheer-UI

```
Doel: geef de SUPERUSER een UI om abonnementen te beheren en per org bij/af te schakelen.

Lees eerst: docs/IMP_PRD_09_SaaS-Abonnementen.md (§4.2 modellen, §5.3 beheer-UI) en in de portal
de pagina's onder pages/organizations/ + het Detail/Overzicht-patroon uit CLAUDE.md.

Stappen:
1. Abonnementen-beheer (op mijn.localhost, platform): CRUD op Plan + per-plan feature-toggles
   (checkbox-lijst uit GET /api/v1/admin/features dat FEATURE_CATALOG teruggeeft;
   toon afhankelijkheden visueel).
2. Org-detailpagina (pages/organizations): plan-keuze (dropdown) + per-feature override
   (uit-plan / bijgeschakeld / afgeschakeld). Toon de effectieve set en WAARSCHUW als een
   afschakeling een afhankelijkheid breekt (bijv. CRM uit terwijl Inspecties aan) — closure wint.
3. Backend: admin-endpoints voor Plan-CRUD + OrganizationFeature-overrides; invalideer de
   entitlements-cache bij elke schrijf.
4. Audit trail op Plan/PlanFeature/OrganizationFeature + AuditHistory-sidebar op org-detail
   (volg "Audit Trail Uitbreiden" in CLAUDE.md: veldlabels NL + enum/value-format).

Constraints:
- Alleen SUPERUSER; gebruik @Roles(Role.SUPERUSER) + bestaande superuser-domein-checks.
- Dependency-validatie zowel server-side (resolver) als als UI-waarschuwing.
- Gebruik shared portal-lib: PageHeader, DetailPageLayout, StatusBadge, useConfirm, etc.

Definition of done:
- SUPERUSER maakt/wijzigt "Basis" en "Compleet"; wijst ze toe; zet op een Basis-org
  WORKFLOW_COMPLEET bij → /documents wordt toegankelijk (na cache-invalidatie/TTL).
- `npx turbo run build` groen; unit/e2e voor de nieuwe endpoints groen.
- Commit: `feat: superuser plan & per-org feature management UI (Fase 3)`.
```

---

## 7. Prompt E — Fase 4: seed-varianten + integrale verificatie

```
Doel: seed de varianten en valideer het geheel end-to-end.

Lees eerst: docs/IMP_PRD_09_SaaS-Abonnementen.md (§7 seed + testmatrix).

Stappen:
1. Breid prisma/seed.ts uit met ≥2 orgs (PRD §7.1):
   - inspexibasis  → plan "Basis"
   - inspexicompleet → plan "Compleet" (alle 9 incl. add-ons)
   - (optioneel) inspeximix → plan "Basis" + OrganizationFeature WORKFLOW_COMPLEET=true
   Per org: ORG_ADMIN + INSPECTEUR (wachtwoord Password123!), 1 relatie, 1 project,
   1 inspectieplan met asset + finding, zodat de basis-keten te doorlopen is.
   Slugs zonder hyphens. Houd de cleanup-volgorde correct.
2. Loop de testmatrix uit PRD §7.3 af (browser-smoketest + e2e), per variant.
3. Schrijf een korte oplever-notitie in docs/ (wat live staat, wat naar later schuift:
   mix-plannen, add-on-prijzen, downgrade-export-UI).

Definition of done:
- `pnpm db:seed` zet beide (drie) orgs + plannen neer zonder FK-fouten.
- PRD §7.3-matrix volledig groen: Basis blokkeert Compleet-functies (UI-pagina + 403),
  basis-keten + klantportaal volledig rond; Compleet overal toegankelijk; override-org
  toont /documents; GET /organizations/me/features geeft 4 vs 9 keys.
- `npx turbo run build` + `pnpm test` + `pnpm test:e2e` groen.
- Commit: `feat: seed basis/compleet org variants + validate entitlements (Fase 4)`.
```

---

## 8. Tips
- Eén PR per fase houdt de review behapbaar; Fase 0 + 1 zijn de hoogste-risico stappen.
- Laat Claude Code bij Fase 1 eerst een **dry-run-lijst** maken van controller→key vóór het annoteren, zodat je de mapping uit PRD §2 nog één keer kunt aftekenen.
- De resterende commerciële keuzes (PRD §8: mix-plannen, add-on-prijzen, downgrade-export-UI) zijn **niet** blokkerend voor Fase 0–2 — pak ze pas bij Fase 3/4.
