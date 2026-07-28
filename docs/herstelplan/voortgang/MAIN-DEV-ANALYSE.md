# Analyse `main` ↔ `dev` — de 12 main-only commits

> Onderzoek naar §3/§7-punt 3 van `AUDIT-onafhankelijk.md`: wat leeft er alleen op
> `origin/main`, wat daarvan zit inhoudelijk al op `dev`, en wat moet er gebeuren
> vóór een release. Statische git-analyse (geen builds/tests); elke bevinding komt
> uit een genoemd git-commando, uitgevoerd op 2026-07-28 na `git fetch origin`.

## 1. Inventaris (`git log --oneline origin/dev..origin/main`)

Exact **12 commits**, in drie groepen:

| Groep | Commits | Wat |
|---|---|---|
| **PR #124** — "AI-agent backoffice" (PRD-12, derde gebruik van dat nummer) | `02540a0` (merge), `4488ccb`, `0af165b`, `6a31c60`, `d75e6b2`, `594438b`, `ecf7704`, `0570ebc`, `fadb606` | Volledige feature, alleen op `main` |
| **PR #105** — `fix/auth-storage-hardening` (H1/H4/H5/K3) | `ba2f53a` (merge), `b42d27d` | Inhoudelijk al op `dev` (zie §2) |
| **Los** | `6c5a1e9` — "Merge pull request #37 from Enspezo/dev" | dev→main-syncmerge; tweede parent (`bf1da58`) is een dev-commit — brengt géén eigen inhoud |

`git cherry origin/dev origin/main` markeert alle 9 non-merge-commits als `+`
(geen patch-id-equivalent op dev) — dat zegt bij re-applies echter niets over de
inhoud; daarom hieronder file-niveau-verificatie.

## 2. PR #105 — inhoudelijk volledig op `dev` (via PR #116)

**Conclusie: SHA-technisch main-only, inhoudelijk niet.** Commit `b39144b`
("fix(security): re-apply auth & storage hardening from main (H1/H4/H5/K3)",
gemerged naar dev via `e0abb51` = PR #116) is een getrouwe re-apply van `b42d27d`.

Verificatie:

- `git show --stat b42d27d` vs `git show --stat b39144b`: **identieke bestandslijst**
  (26 bestanden; #116 heeft alleen +`CLAUDE.md` en een anders genaamde migratiemap).
- H1 — `git grep "Ongeldige storage-key" origin/dev` → aanwezig in
  `apps/api/src/common/services/storage/local-storage.provider.ts` (+ spec);
  `sanitizeStorageFilename/-Extension` bestaan op dev
  (`apps/api/src/common/utils/storage-key.util.ts`) en worden gebruikt op alle
  call-sites (documents, email-templates, quote-templates, quote-attachments,
  organizations, users, inspector-certificates, location-images,
  measurement-instruments).
- H4 — `origin/dev:apps/api/src/common/config/validate-jwt-secrets.ts` bestaat.
- H5 — `origin/dev:.../jwt.strategy.ts:25` bevat `if (payload.type !== 'access')`;
  `pwStamp` aanwezig in `auth.service.ts`.
- K3 — `origin/dev:apps/api/prisma/seed.ts:442` gate't de magic-links op
  `process.env.SEED_DEMO === '1'`.

Bovendien is de H1-laag op dev daarna nog **verder aangescherpt** door het
herstelprogramma (o.a. `d8aad86` WP-B4-sweep B-507, `69b47a5` B-105
existence-oracle, `b9da4bc` B-153/154) — dev is hier dus niet gelijk aan, maar
**vóór** op main.

**Eén levend restant van #105: de migratie.** Main draagt
`20260702073318_add_user_password_changed_at`; dev draagt hetzelfde SQL als
`20260703122930_auth_storage_hardening`. Beide doen letterlijk
`ALTER TABLE "imp_users" ADD COLUMN "password_changed_at" TIMESTAMP(3);`
(geverifieerd met `git show` van beide bestanden). Een merge die beide mappen in
één keten zet, faalt bij een schone replay (dubbele kolom) — zie §4/§5.

## 3. PR #124 — "AI-agent backoffice": écht main-only

**Conclusie: volledige, alleen-op-main gebouwde feature.** Omvang
(`git diff --stat ba2f53a..02540a0`): **55 bestanden, +4438/−9**.

Inhoud (uit `git diff --name-status ba2f53a..02540a0`):

- **Backend**: nieuwe module `apps/api/src/modules/ai-agent/` (controller
  `@Controller('ai')`, services ai-agent/ai-runner/ai-action/ai-usage,
  `AiAgentAccessGuard`, eigen `AiAnthropicProvider`, `tools/tool-registry.ts`
  met 13 tools: search/get contacts, list/get requests, list/get tasks,
  kvk_search/profile, pdok_suggest/lookup + write-tools create_task,
  update_task, create_note achter een bevestigingskaart `AiPendingAction`).
- **Schema**: 4 nieuwe modellen (`AiConversation`, `AiMessage`,
  `AiPendingAction`, `AiUsageLog`), 3 enums (`AuditSource`, `AiMessageRole`,
  `AiActionStatus`), `AuditLog.source` (HUMAN/AI, default HUMAN),
  `Organization.aiAgentEnabled` + `aiAgentAllowedRoles`.
- **Migraties (3)**: `20260713223538_add_ai_agent_and_audit_source`,
  `20260715183604_add_org_ai_agent_settings`,
  `20260715212056_ai_usage_cache_creation_and_drop_audit_log_id`.
- **Kern-raakpunten**: `prisma.service.ts` (audit-`$use`: `source`-kolom in de
  raw `INSERT INTO imp_audit_logs`), `audit-context.interceptor.ts` +
  `request-context.ts` (`source` in de AsyncLocalStorage-context),
  `contacts.service.ts` (VIES-audit krijgt `ctx.source`), `app.module.ts`,
  entitlement-key **`AI_AGENT`** in `packages/entitlements/src/feature-catalog.ts`,
  org-flags in `organizations`-dto/controller, seed.
- **Portal**: `components/ai-assistant/` (drawer, streaming-hook,
  pending-action-card, usage-badge), `ai-agent-provider.tsx`, wijzigingen in
  header/app-layout/main/tenant-provider/types, org-settings-tab,
  `audit-history.tsx` (AI-badge).
- **Docs**: `docs/IMP_PRD_12_AI-Agent-Backoffice.md` (let op: **derde** betekenis
  van "PRD-12" naast beschikbaarheid en projectfasen).
- **Test**: `apps/api/test/ai-agent.e2e-spec.ts` + 6 unit-specs.

Positief voor het raakvlak: de tool-registry **delegeert naar de bestaande
feature-services met de ingelogde user** ("de agent kan nooit meer dan de
gebruiker zelf") — org-/rolscoping en dus ook de WP-B3-fixes werken er
automatisch in door. De controller is `@Roles(...ALL_STAFF)` +
`@RequiresFeature('AI_AGENT')` + eigen guard + throttle 30/min.

## 4. Proef-merge (weggegooid, niet gepusht)

Uitgevoerd: `git checkout -b tmp/... origin/dev` →
`git merge origin/main --no-commit --no-ff` → inventaris → `git merge --abort`.

Resultaat: **23 conflictpaden** (22 `UU` + 1 `AA`):

| Cluster | Bestanden | Aard |
|---|---|---|
| #105-lijn (main-zijde = verouderd `b42d27d`, dev-zijde = #116 + WP-B4/B-105/B-153) | `local-storage.provider.ts` (+spec, `AA`), `common/utils/index.ts`, `main.ts`, `documents.service.ts`, `email-templates.service.ts`, `inspector-certificates.service.ts`, `location-images.service.ts`, `measurement-instruments.service.ts`, `quote-templates.service.ts`, `quote-attachments.service.ts`, `users.service.ts`, `organizations.service.ts` | Dev-zijde is overal de nieuwere, hardere variant; main-zijde bevat geen unieke hunks buiten `b42d27d` (main heeft ná de merge-base `40bc560` alleen deze 12 commits). Resolutie = dev-zijde nemen. NB `main.ts`: dev-zijde bevat ook WP-C1 (`createAppValidationPipe`) en de body-limiet/helmet-opzet — main-zijde daar is strikt ouder |
| #124-lijn (echt tweezijdig) | `schema.prisma`, `seed.ts`, `organizations/dto/update-organization.dto.ts`, `organizations.controller.ts` (dev-zijde: B-505/B-510 entitlement-gated org-flags), `feature-catalog.ts` (dev: `AI_REVIEW`/`ONLINE_HERSTEL`/`PROJECT_FASEN` vs main: `AI_AGENT`), portal `types/index.ts`, `tenant-provider.tsx`, `organization-settings-page.tsx`, `use-organization.ts` | Additief oplosbaar, maar vergt begrip van beide kanten |

Auto-gemerged maar **semantisch te reviewen**: `prisma.service.ts` (+spec),
`audit-context.interceptor.ts`, `request-context.ts`, `contacts.service.ts`,
`app.module.ts`, portal `header.tsx`/`app-layout.tsx`/`main.tsx`,
`audit-history.tsx`.

### Migratieketen-hazards (belangrijkste bevinding)

1. **Dubbele migratie**: de merge brengt main's
   `20260702073318_add_user_password_changed_at` mee naast dev's
   `20260703122930_auth_storage_hardening` — identiek SQL. Schone replay
   (`migrate reset`/shadow-DB) faalt op de tweede `ADD COLUMN`; een bestaande
   dev-DB faalt bij `migrate deploy` op de eerste. **Main's map mag nooit
   ongewijzigd de dev-keten in** (verwijderen, of beide idempotent maken met
   `IF NOT EXISTS`, plus `prisma migrate resolve --applied` op omgevingen die de
   andere variant al draaiden).
2. **Interleaving**: #124's migraties (0713/0715) sorteren vóór dev-migraties
   die al toegepast zijn (`20260715173330_add_inspector_availability` t/m
   `20260728100000_canonicalize_sheet_record_data`). Schone replay is
   volgorde-technisch OK; bestaande dev-DB's krijgen ze out-of-order via
   `migrate deploy` (kan, maar `migrate dev` gaat waarschuwen). Bij het porten:
   óf originele mapnamen behouden (verplicht als er ergens een DB de main-keten
   volgt!), óf her-timestampen naar ná `20260728100000` (alleen veilig als géén
   omgeving de main-keten met #124 al toepaste). Eerst vaststellen welke
   omgevingen welke keten draaien.
3. `20260715212056` bevat de idempotente GiST-recreate voor
   `imp_asset_nodes_path_gist` — bij hergenereren geldt de vaste discipline:
   `DROP INDEX`-regels voor de GiST- en de ai-review-partial-unique-index
   handmatig strippen (zie CLAUDE.md).

## 5. Risico-oppervlak met de herstelfixes

| Herstelfix | Raakvlak met #124 | Risico |
|---|---|---|
| **WP-C1** (exception-filter, NL-foutcontract, `createAppValidationPipe`, RoleRoute) | `ai-agent.controller` is gebouwd tegen het oude foutcontract; de messages-route streamt (SSE-achtig) en loopt deels búiten de filter om; portal-integratie (header/app-layout/main) is gebouwd zonder RoleRoute-conventies | Middel — compile/gedrag na port checken; foutpaden van de streaming-route apart testen |
| **WP-B4/#164** (upload/storage-hardening, helmet, body-limieten) | Geen upload-routes in #124; wél `main.ts`-conflict (dev-zijde wint). De AI-drawer praat met een streaming endpoint — controleren dat de 1 MB-bodylimiet volstaat voor lange gesprekken (berichten zijn tekst; waarschijnlijk OK, expliciet testen) | Laag–middel |
| **WP-B3** (superuser-/org-scoping) | Tools delegeren naar feature-services met de user → erven de fixes. Maar: `AiAgentAccessGuard`/conversatie-queries zelf scopen op `orgId`+`userId` — superuser (orgId `null`) gedrag reviewen tegen de B3-conventies | Laag–middel |
| **Audit-registry (R2) + WP's die audit raakten** | `AuditLog.source` verandert de raw `INSERT` in `prisma.service.ts` en de audit-context; dev's registry is sindsdien doorontwikkeld — de auto-merge oogt schoon maar moet met de audit-unit/e2e-suites bevestigd worden | Middel |
| **WP-B6** (paginatiecontract) | `GET /ai/conversations` heeft geen page/limit-params — valt buiten de parametrische e2e; niets te doen tenzij er paginatie bijkomt | Laag |
| **PRD-13 `AnthropicClientService`** | #124 heeft een eigen `AiAnthropicProvider`; dev heeft sindsdien de gedeelde `common/services/anthropic/`-client ("latere AI-functies haken hier aan") | Architectuur-dubbeling — bij het porten omhangen naar de gedeelde client |
| **Entitlements** | `AI_AGENT`-key conflicteert tekstueel met dev's `AI_REVIEW`/`ONLINE_HERSTEL`/`PROJECT_FASEN`; additief oplosbaar. Org-flags (`aiAgentEnabled`/`aiAgentAllowedRoles`) moeten langs dev's B-505/B-510-regels (entitlement-gated org-flags) | Laag, wel bewust doen |

## 6. Geadviseerd releasepad

1. **Beslis eerst over PR #124**: wil het product de AI-agent-backoffice in de
   release? Zo nee → main t.z.t. gewoon overschrijven met dev (release-merge) en
   #124 apart parkeren op zijn branch (`claude/ai-agent-backoffice-prd-dsnivl`
   bestaat nog op origin). Zo ja → stap 2.
2. **Port #124 naar dev via een eigen PR** (bv. `feat/ai-agent-backoffice-dev`
   vanaf `origin/dev`), niet via een kale `merge origin/main`:
   - migraties: main's `20260702073318` **niet** meenemen; de 3 ai-agent-migraties
     meenemen conform §4-punt 2 (eerst omgevingsinventaris ketens);
   - `feature-catalog` additief; org-flags langs B-505/B-510;
   - `AiAnthropicProvider` vervangen door de gedeelde `AnthropicClientService`;
   - controller/portal aanpassen aan WP-C1-conventies (NL-foutcontract, RoleRoute);
   - `prisma.service`/audit-context `source`-wijziging integreren op dev's
     huidige registry;
   - hernoem de doc naar een uniek nummer (PRD-12 is al tweemaal bezet).
3. **Hertesten na de port** (concreet):
   - unit: alle `ai-agent`-specs, `prisma.service.spec.ts`,
     `contacts.service.spec.ts`, storage-/sanitize-specs;
   - e2e: `ai-agent.e2e-spec.ts`, `cross-tenant`, `audit-log`, `documents`,
     `auth` (H4/H5 blijven groen), `organizations` (org-flags),
     `pagination-limit` (parametrisch);
   - migratie-replay: `migrate reset` op een wegwerp-DB + `migrate deploy` op een
     kopie van een bestaande dev-DB (en, indien aanwezig, een main-keten-DB);
   - `npx turbo run build`;
   - browser-smoke: assistent-drawer aan/uit via entitlement + org-toggle +
     rollen, bevestigingskaart bij write-tool, AI-badge in audit-history,
     org-settings-tab.
4. **Daarna pas de release-merge `dev → main`**. Met #124 al op dev resteren op
   main geen unieke wijzigingen meer (#105 = #116, `6c5a1e9` = dev-sync); de
   release-merge kan dan met dev-zijde als winnaar voor alle §4-conflicten in de
   #105-lijn. Draai op de release-kandidaat minimaal de volledige e2e-suite +
   de smoketest uit het testprogramma.
5. **Deploy-aandachtspunt**: elke omgeving die main's keten ooit toepaste heeft
   `20260702073318` (en evt. de ai-agent-migraties) al in `_prisma_migrations`
   staan; los het `password_changed_at`-paar daar op met
   `prisma migrate resolve --applied` of idempotent SQL — anders faalt de eerste
   deploy van de samengevoegde keten.

## 7. Gebruikte commando's (reproduceerbaar)

```
git fetch origin
git log --oneline origin/dev..origin/main
git cherry origin/dev origin/main
git merge-base origin/dev origin/main                     # 40bc560
git show --stat b42d27d ; git show --stat b39144b         # #105 vs #116
git grep "Ongeldige storage-key" origin/dev -- apps/api/src
git grep -n "type !== 'access'\|pwStamp" origin/dev -- apps/api/src/modules/auth
git grep -n "SEED_DEMO" origin/dev -- apps/api/prisma/seed.ts
git diff --stat ba2f53a..02540a0 ; git diff --name-status ba2f53a..02540a0
git show origin/main:apps/api/prisma/migrations/20260702073318_.../migration.sql
git show origin/dev:apps/api/prisma/migrations/20260703122930_.../migration.sql
git ls-tree --name-only origin/dev:apps/api/prisma/migrations | sort
git checkout -b tmp/main-dev-proefmerge origin/dev
git merge origin/main --no-commit --no-ff                 # 23 conflictpaden
git diff --name-only --diff-filter=U ; git status --short
git merge --abort ; git branch -D tmp/main-dev-proefmerge
```
