# Fase 2 — API kern-inspectiedomein (uitgewerkt)

Concrete uitwerking van **Fase 2** uit `docs/INTEGRATIE-INSPEXI-APP.md`: de configuratie- en uitvoeringsmodules van Inspexi-App overnemen in de Beheer-API, in Beheer-conventies. Bouwt voort op het Fase 1-schema (`docs/fase1/`).

**Scope Fase 2:** config-modules (referentiedata/templates) + uitvoeringsmodules (plan→asset→finding) + de dashboard/stats. **Buiten scope** (eigen fase): `sync` → Fase 3, document-generatie → Fase 4, client-auth realm → Fase 6, voice → Fase 7. Wel zorgen we dat de modellen die deze fases voeden er al zijn.

Deliverables in deze map:

- **`FASE2-API.md`** (dit bestand) — porting-gids, volgorde, per-module checklist, cross-cutting werk.
- **`code/storage/`** — `R2StorageProvider` + env-schakelbare `StorageModule`.
- **`code/lookups/`** — `LookupService`/controller/module + DTO's voor de 11 per-org lookups uit Fase 1.
- **`code/seed/seed-lookups.ts`** — seed van de 11 lookup-systeemdefaults (NL labels + kleuren).
- **`code/inspection-plans/`** — golden-path **uitvoeringsmodule** (volledig) als kopieersjabloon.
- **`code/asset-types/`** — golden-path **config-module** (volledig): `/merged`-overlay, velden + constraints, `validate-parent`, duplicate, org+isSystem.
- **`code/assets/`** — geporte uitvoeringsmodule: boom (parent/treePath), reorder/move (circular-check), `X-Device-ID`, `statusCode`-lookup, parent-constraint via `AssetTypesService`.
- **`code/findings/`** — geporte uitvoeringsmodule: `statusCode`-lookup + resolutie op systeemcode `resolved`, classificatiewaarden, foto-koppeling, FK-validatie.

> De code staat bewust in `docs/fase2/code/` (niet live in `apps/api`) zodat de build niet breekt vóór de Fase 1-migratie + lookups bestaan. Elk bestand begint met de doel-locatie in `apps/api`.

---

## 1. Conventies (samengevat uit de bestaande Beheer-API)

Gelezen uit `tasks`/`products`-modules, `common/`, `main.ts`, `app.module.ts`:

- **Module-structuur**: `*.controller.ts` (dun) + `*.service.ts` (logica) + `*.module.ts` + `dto/`.
- **Guards zijn globaal** (`app.module.ts`: `JwtAuthGuard` → `RolesGuard` → `TenantGuard` + `AppThrottlerGuard`). In de module dus alleen `@Roles(Role.X)` en evt. `@Public()`. Géén `@UseGuards` per controller nodig.
- **Response-envelope is handmatig** in de controller: `return { success: true, data }` / `{ success: true, message }`. Er is **geen** response-interceptor; `AllExceptionsFilter` doet de error-envelope.
- **`@CurrentUser() user: User`** levert het volledige Prisma-`User` (met `user.roles: Role[]`, `user.orgId`). **`@CurrentTenant()`** levert `TenantContext`.
- **Helpers uit `@/common`**: `paginate(model, {where,include,orderBy,page,limit})`, `buildOrderBy(sortBy,sortOrder,allowed,default)`, `orgScope(user)`, `assertFound(entity,'Label')`, `assertSameOrg(model,id,orgId,'Label')`, `assertAllSameOrg(...)`.
- **DTO's**: `class-validator` + `@ApiProperty(Optional)`; lijst-DTO's extenden `BasePaginationQueryDto` (`@/common/dto`).
- **orgId bij create**: `orgId: user.roles.includes(Role.SUPERUSER) && !user.orgId ? '' : user.orgId!` (zie tasks). Voor het inspectiedomein vereisen we doorgaans een echte org (zie golden path `requireOrg`).
- **Pad-alias** `@/` → `apps/api/src`.
- **Swagger** globaal aan (`/api/docs`); rate-limiting globaal 120/min, strenger met `@Throttle()` waar nodig.

---

## 2. Rol-mapping (App `@Roles('...')` → Beheer `Role`)

| App (string) | Beheer (`Role`) |
|---|---|
| `superadmin` | `Role.SUPERUSER` |
| `administrator` | `Role.ORG_ADMIN` |
| `werkvoorbereider` | `Role.WERKVOORBEREIDER` |
| `inspecteur` | `Role.INSPECTEUR` |

App's `SuperadminGuard` → `@Roles(Role.SUPERUSER)`; `AdminGuard` → `@Roles(Role.SUPERUSER, Role.ORG_ADMIN)`. Beheer's extra rollen `MANAGER`/`BACKOFFICE` voeg je toe waar backoffice-medewerkers mee mogen kijken/werken (zie de `CRM_ROLES`-constante in de golden path).

---

## 3. Cross-cutting fundament (eerst bouwen)

### 3.1 Storage (R2 achter de interface) — `code/storage/`
`R2StorageProvider implements StorageProvider` + 2 extra methoden (`getSignedUrl`/`getPublicUrl`) via `SignedUrlCapableStorage`. `StorageModule` kiest driver op `STORAGE_DRIVER` (local|r2). Deps toevoegen: `@aws-sdk/client-s3 @aws-sdk/s3-request-presigner`. Env: `STORAGE_DRIVER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. Storage-key-patroon (caller bepaalt): `{orgId}/{uuid}-{filename}`.

### 3.2 Lookups (Fase 1) — `code/lookups/` + `code/seed/seed-lookups.ts`
`LookupService` met `resolveLookup(kind,code,orgId)`, `listMerged(kind,user)`, `listRaw`, CRUD. Registreer `LookupModule` en **importeer** hem in elke module die `*Code`-velden valideert/resolveert. Portal/PWA halen `GET /lookups/:kind` op en bouwen daaruit hun `StatusMap` (label + kleur) — services enrichen rijen dus niet zelf.

**Seed**: `seed-lookups.ts` vult de 11 tabellen met globale systeemdefaults (`orgId = null`, `isSystem = true`). Idempotent (`deleteMany({orgId:null})` + `createMany`). Roep `await seedLookups(prisma)` aan in `prisma/seed.ts`. Org-overrides worden niet geseed — die maakt een org zelf via `/lookups`.

### 3.3 Tenant-scoping — twee patronen
- **Uitvoeringsmodellen** (orgId verplicht): `where: { ...orgScope(user), deletedAt: null }`. Filter `deletedAt: null` **expliciet** (geen middleware; inspectiedomein gebruikt `deletedAt`, niet `isDeleted`).
- **Config-modellen** (orgId nullable + `isSystem`): org ziet systeemrijen (orgId null) **én** eigen rijen. Voeg een helper toe aan `common/utils`:

```ts
// common/utils/org-scope.ts (uitbreiding)
export function orgOrSystemScope(user: ScopedUser): { OR?: Array<{ orgId: string | null }> } {
  if (user.roles.includes(Role.SUPERUSER)) return {};            // superuser: alles
  return { OR: [{ orgId: user.orgId! }, { orgId: null }] };       // org + systeemdefaults
}
```
Combineer met andere filters via `AND` (Prisma staat maar één `OR`-sleutel toe):
`where: { AND: [orgOrSystemScope(user), { isActive: true, ...(search ? {OR:[...]} : {}) }] }`.

### 3.4 FK-validatie
- Externe FK binnen eigen org → `assertSameOrg(this.prisma.<model>, id, orgId, 'Label')`.
- FK naar een **org-of-systeem**-record (templates, asset-types met `orgId` null): aparte check (`orgId === null || orgId === user.orgId`). Zie `assertTemplateUsable` in de golden path.

### 3.5 Audit-registratie
Breid `apps/api/src/prisma/prisma.service.ts` uit: voeg de te auditen inspectiemodellen toe aan `AUDITED_MODELS` én `MODEL_TABLE_MAP` (modelnaam → `imp_*`). Zie Fase 1 §6 voor de lijst. Lookups en sync/queue-tabellen niet auditen.

### 3.6 Registratie in `app.module.ts`
Voeg de nieuwe modules toe aan `imports`. Volgorde maakt functioneel niet uit, maar groepeer logisch. Importeer `LookupModule` in elke module die het gebruikt (Nest DI), niet globaal.

---

## 4. Module-volgorde & inventaris

Bouw in afhankelijkheidsvolgorde. Endpoints staan in de globale inventaris (`docs/INTEGRATIE-INSPEXI-APP.md` §5 + de API-analyse); hieronder de port-volgorde met aandachtspunten.

### Groep A — Referentie/config (eerst; org-of-systeem patroon)
1. **lookups** (3.2) — basis voor alle `*Code`-velden.
2. **norm-types** (`NormTypeDefinition`) — globaal, superuser-only, soft-delete + restore.
3. **classification-models** (+ characteristics + options) — superuser, systeemniveau, genest.
4. **categories** — org+systeem, hiërarchie.
5. **asset-types** / **location-types** (+ fields + constraints + measurement-configs) — org+systeem; `/merged` (code-overlay) endpoint; **PWA-referentie-endpoints** — route-namen stabiel houden.
6. **finding-templates** — org+systeem, FK naar classificationModel + category, import/export, duplicate.
7. **checklists** (+ checklist-items + version history) — org+systeem, versiebeheer (CONCEPT/ACTIEF/VERVALLEN), `for-asset` lookup voor PWA.
8. **measurement-sheet-templates** (+ sections + fields + version history) — **globaal** (geen orgId), superuser; form-builder.
9. **inspection-templates** (+ checklist/meetstaat-links + version history) — org+systeem, fork + versie.

### Groep B — Uitvoering (orgId verplicht + denormaliseerd; sync-velden)
10. **inspection-plans** — **golden path** (zie `code/inspection-plans/`). submit/review-workflow.
11. **assets** — ✅ geport (`code/assets/`): boom (parent/treePath), `X-Device-ID` op create, reorder/move.
12. **inspection-locations** (App `locations`, hernoemd) — boom + tree/reorder/move (kopieer `assets`-patroon).
13. **visual-inspections** + **measurement-records** — hangen aan asset; produceren findings.
14. **findings** — ✅ geport (`code/findings/`): classificatiewaarden JSON; statusCode-lookup; resolutie.
15. **measurement-sheet-records** — ingevulde meetstaten (template-snapshot); validate/complete.
16. **location-images** (+ markers) — multipart upload (R2), quick-create asset/measurement/finding.
17. **standalone-measurements** (+ values) — losse metingen, link-asset.

### Groep C — Overzicht
18. **portal-stats** — dashboard-widgets (`/portal/stats/*`); puur read, org-scoped.

> **PWA-contract**: groep A-referentie-lijsten (`asset-types`, `classification-models`, `finding-templates`, `measurement-sheet-templates`) en de uitvoerings-endpoints worden door de offline-app gebruikt. Houd route-namespaces + `{success,data}`-envelope stabiel (details in Fase 3).

---

## 5. Per-module checklist (herhaal voor elke module)

- [ ] `modules/<naam>/` met controller + service + module + `dto/`.
- [ ] Controller dun: `@ApiTags`, `@ApiBearerAuth`, `@Roles(...)`, `{ success, data }`-wrap, `ParseUUIDPipe` op `:id`.
- [ ] Service: `paginate` + `buildOrderBy` voor lijsten; `assertFound` voor 404; NL-meldingen.
- [ ] Scoping: `orgScope`+`deletedAt:null` (uitvoering) of `orgOrSystemScope` (config).
- [ ] FK-validatie met `assertSameOrg` / org-of-systeem-check vóór elke schrijfactie.
- [ ] `*Code`-velden valideren/resolveren via `LookupService`; norm via `NormTypeDefinition`.
- [ ] `orgId` zetten bij create (uitvoering: `requireOrg`); `createdBy`/`deviceId`/sync-velden meenemen.
- [ ] Soft-delete = `deletedAt` (niet hard delete) voor sync-tabellen.
- [ ] Module registreren in `app.module.ts`; `LookupModule` importeren waar nodig.
- [ ] Model toevoegen aan `AUDITED_MODELS` + `MODEL_TABLE_MAP` (indien geaudit).
- [ ] Swagger-annotaties; gevoelige routes `@Throttle()`.
- [ ] Unit-spec (`*.service.spec.ts`) + E2E-suite; **cross-tenant-test** (vreemde org-UUID in FK → 403).
- [ ] Route-volgorde: specifieke routes (`:id/submit`) vóór `:id`.

---

## 6. Config-module skelet (org + isSystem merge)

> **Volledig referentievoorbeeld: `code/asset-types/`** — geport uit App met `/merged`-overlay (org overschrijft systeem op `code`), velden + parent-constraints als sub-resources, `validate-parent` (door PWA gebruikt), `duplicate` (systeemtype → org-fork) en de `assertManageable`-autorisatie. `location-types` is een 1-op-1 kopie; `categories`/`checklists`/`finding-templates`/`classification-models`/`inspection-templates` volgen hetzelfde skelet met hun eigen velden/sub-resources.

De kern van het patroon (`findAll`/`create`):

```ts
async findAll(user: User, q: ListQueryDto) {
  const where = {
    AND: [
      orgOrSystemScope(user),
      { deletedAt: null, ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}) },
    ],
  };
  return paginate(this.prisma.assetTypeDefinition, {
    where, orderBy: { sortOrder: 'asc' }, page: q.page, limit: q.limit,
  });
}

async create(dto: CreateDto, user: User) {
  const isSuper = user.roles.includes(Role.SUPERUSER);
  return this.prisma.assetTypeDefinition.create({
    data: {
      orgId: isSuper ? null : user.orgId!,   // superuser → systeemdefinitie
      isSystem: isSuper,
      code: dto.code, name: dto.name, /* ... */
    },
  });
}

// update/remove: blokkeer wijzigen van systeemrijen (orgId null / isSystem) door org-admin
private assertManageable(row: { orgId: string | null; isSystem: boolean }, user: User) {
  if (user.roles.includes(Role.SUPERUSER)) return;
  if (row.orgId === null || row.isSystem) throw new ForbiddenException('Systeemdefinitie is alleen-lezen');
  if (row.orgId !== user.orgId) throw new ForbiddenException('Hoort niet bij uw organisatie');
}
```
Dit is exact het patroon dat `LookupService` (3.2) ook gebruikt — hergebruik die als referentie.

---

## 7. Uitvoeringsdomein-specifiek (golden path)

Zie `code/inspection-plans/`. Belangrijkste verschillen met config:

1. **`orgId` verplicht + gedenormaliseerd** — `requireOrg(user)`; zet `orgId` bij create van plan, asset, finding, record. Sub-services nemen `orgId` over van het bovenliggende plan (niet door de PWA laten bepalen).
2. **`assertSameOrg` op élke FK** — contact, project, user (assignee/reviewer), contactPerson; template via org-of-systeem-check.
3. **Status-transities vergelijken systeemcodes** (`draft`/`pending_review`/`approved`) — labels mogen per org afwijken, codes niet (Fase 1 §3a). Houd de beschermde codes in constants.
4. **Soft-delete = `deletedAt`** (tombstone voor sync-pull).
5. **`X-Device-ID`-header** doorlaten op create-endpoints van asset/finding/standalone-measurement (PWA).
6. **Notificaties** (toewijzing/review) via Beheer's `NotificationsService` — voeg de relevante `NotificationType`-waarden toe (zie bestaand patroon in `tasks.service`).

---

## 8. Env-toevoegingen (`apps/api/.env.example`)

```env
# Storage
STORAGE_DRIVER=local            # local | r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```
(Anthropic/voice-keys en CLIENT_JWT_* komen in Fase 7/6.)

---

## 9. Verificatie (onderdeel van Fase 2)

- [ ] `npx turbo run build` groen (TS + Prisma-client met de Fase 1-modellen).
- [ ] Swagger `/api/docs` toont de nieuwe tags; alle endpoints onder `@ApiBearerAuth`.
- [ ] Seed bevat de 11 lookup-defaults; `GET /lookups/plan-status-types` geeft systeemdefaults; een org-override wint.
- [ ] E2E per module + **cross-tenant.e2e-spec** uitbreiden: org A stuurt org B's `contactId`/`assetId`/`templateId` in create/update → **403**.
- [ ] PWA-rooktest: referentie-lijsten (`asset-types`, `finding-templates`, …) en `inspection-plans` CRUD werken met de `{success,data}`-envelope en interne JWT.
- [ ] Statusovergangen: `submit` vanuit `draft` → `pending_review`; `review approve` → `approved`; herlabelen van een status-lookup breekt de flow niet.

---

## 10. Aandachtspunten / bewuste keuzes

1. **Response-envelope handmatig** (geen interceptor) — consistent met de rest van Beheer; vergeet de wrap niet in nieuwe controllers.
2. **`StorageProvider` blijft 4 methoden**; signed-URL's via optionele `SignedUrlCapableStorage` + `supportsSignedUrls()`-feature-detect (breekt bestaande `documents`-module niet).
3. **Lookups zonder harde FK** — `*Code`-velden zijn vrije strings; integriteit/resolutie in de service (Fase 1 §3b). De `LookupService.resolveLookup` is de enige plek die de org-voorrang implementeert — hergebruik 'm overal.
4. **`deletedAt` i.p.v. `isDeleted`** in het hele inspectiedomein — filter expliciet per query.
5. **Superuser zonder org** kan geen inspectieplan aanmaken (`requireOrg`) — bewust; superuser werkt binnen een org-subdomein-context.
6. **Sync/docgen/client/voice** zijn expliciet latere fases; de modellen staan er al (Fase 1), de endpoints volgen daar.
