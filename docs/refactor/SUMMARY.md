# Refactor & Query-Optimization — Summary

> Final report for the codebase-wide refactor/perf track. Audit in `AUDIT.md`, sequenced plan in `PLAN.md`.
> All work shipped as small, independently-reviewed PRs merged to `dev`.

## Outcome at a glance

**7 PRs merged to `dev`**, covering every planned area: security, indexes, query-perf, convention/dedup, and frontend.

| Suite | Baseline (Fase 0) | After |
|---|---|---|
| API unit | 1205 / 79 suites | **1206 / 79** (+1 test) |
| API e2e | 611 / 42 suites | **629 / 42** (+18 cross-tenant cases) |
| Portal vitest | 206 / 20 | **206 / 20** |
| `turbo run build` | 4/4 green | **4/4 green** |
| Lint | not configured (eslint not installed) — verified via `tsc -b` + build | unchanged |

No regressions; cross-tenant isolation **strengthened**. Every behavior change is documented in its PR.

## Merged PRs

| PR | Area | What |
|---|---|---|
| [#52](https://github.com/Enspezo/Inspexi-IPM/pull/52) | docs | `AUDIT.md` + `PLAN.md` + baseline (Fase 0). |
| [#53](https://github.com/Enspezo/Inspexi-IPM/pull/53) | **security** | Close 4 cross-tenant FK-injection gaps (projects/notes/requests/quotes) via `assertSameOrg`; +18 cross-tenant e2e cases. |
| [#54](https://github.com/Enspezo/Inspexi-IPM/pull/54) | perf/db | +9 indexes for hot multi-tenant/auth/sync queries; −3 redundant indexes. |
| [#55](https://github.com/Enspezo/Inspexi-IPM/pull/55) | perf | Parallelize dashboard stats + inspection-plan validations (`Promise.all`). |
| [#56](https://github.com/Enspezo/Inspexi-IPM/pull/56) | perf | Eliminate the per-recipient N+1 in notification dispatch (batch + `createMany`). |
| [#57](https://github.com/Enspezo/Inspexi-IPM/pull/57) | dedup | `requireOrg`/`checkOrgAccess` → `@/common` (−38 lines across 13 services). |
| [#58](https://github.com/Enspezo/Inspexi-IPM/pull/58) | frontend | Fix broken attachment download (FE-1) + shared-lib dedup (`formatFileSize` ×5, `useConfirm`) + dead code. |

## Performance improvements (before → after)

Method: static query-count from each diff (queries themselves unchanged — only their scheduling/indexing). EXPLAIN on
seed-sized tables is uninformative (the planner picks seq-scan on tiny tables regardless), so indexes are justified by
the query they serve and confirmed live via `pg_indexes`.

- **Indexes (#54).** `User` had **zero** indexes → `(orgId, isDeleted)`; `RefreshToken.tokenHash` (hit on every refresh/logout) was unindexed → indexed; `AuditLog` history filter+sort now served by one `(entityType, entityId, createdAt)` index; PWA `/sync` delta pulls on `InspectionPlan/Asset/Photo` `(orgId, updatedAt|createdAt)`; dashboard open-findings `(orgId, status)`; client-portal `InspectionClientAccess(clientUserId)`. Dropped 3 redundant indexes (write-amplification).
- **Dashboard (#55).** `getDashboardStats` 6 serial `count()` → 1 `Promise.all`; `getInspectionsChart` 8 serial weekly counts → 1 batch; `getRecentActivities` 2 serial `findMany` → 1 batch.
- **Inspection-plan create/update (#55).** 8 serial pre-write validations → 1 `Promise.all`.
- **Notification dispatch (#56).** ~2–4 queries × R recipients (sequential) → **4 batched queries + 1 `createMany`**, regardless of recipient count. Biggest real N+1 in the codebase.

## Security (cross-tenant isolation)

PR #53 closed 4 FK-injection gaps where create/update accepted an FK UUID and wrote it without verifying org ownership.
Worst case was `projects.create` doing an **un-scoped `UPDATE`** on another tenant's request/quote (now `assertSameOrg`
+ org-scoped `updateMany`). Each gap is covered by an attack + positive-control e2e case. SUPERUSER's intentional
tenant-scope bypass is preserved.

## Conventions & dedup applied

- `requireOrg(user)` (11 copies) + `assertOrgAccess(user, orgId)` (2 copies) → single `@/common` helpers (#57).
- Frontend `formatFileSize` (5 local `formatBytes` copies removed), `useConfirm` (last `window.confirm` removed), `@/lib/format` extended to GB/TB (#58).
- Existing convention adoption confirmed already-good by the audit: `paginate`, `orgScope`, `assertFound`,
  `assertSameOrg`, `common/auth/roles`, audit `AUDITED_ENTITIES`, `lib/status`/`lib/format`, `tenantStorage`.

---

## Reported but NOT done (for later)

Prioritized, with audit IDs. Each is scoped in `AUDIT.md` / `PLAN.md`.

### Dedup / conventions (backend)
- **PR-8 / DUP-2 (high value, mechanical):** the config-template guard trio `assertManageable` (~10 copies) / `assertConcept` (3) / `assertVisible` (3) across lookups/checklists/templates/types/categories → DI-free `@/common` helpers. The single biggest remaining dedup lever; lets the config CRUD services stay un-split.
- **PR-9 / DEDUP-1 + DEDUP-2 + PERF-7/8 (high value, behavior-visible):** `enrichWithEntityNames` is duplicated across **5 copies** (tasks/notes/documents/search ×2) with real display **drift** (Contact email-fallback, Project `number — title` vs `number`, Location name vs address, search omits PROJECT/USER). Consolidate onto the existing `common/audit` `ENTITY_DISPLAYS`/`displayReference` (favorites already uses it) and add per-model `select` to the FK batch-lookups (kills the audit/favorites over-fetch, PERF-7/8). Behavior-visible (display strings normalize) → snapshot/adjust tests.
- **PR-10 / CONV-5/6/8:** `search.service.ts` hand-rolls `Promise.all([findMany,count])`+skip/take in 8 methods → `paginate`; local `orgScope` shadow → shared helper; scattered manual `NotFoundException` → `assertFound`.
- **PR-11 / DUP-4/5/6:** `generateOrgSequentialNumber` (projects+quotes), `@/common/constants/mime-types.ts`, backend `formatDateNL`.
- **client-realm `requireOrg(orgId)`** in `client-auth` + `client-inspections` (orgId-variant, different message) — a separate small dedup (`requireOrgId`) left out of #57 by design.

### Splits (backend) — SPLIT-1..5
- **SPLIT-2 (lowest risk):** extract the DI-free validation engine from `measurement-sheet-records.service.ts` (pure functions, instantly unit-testable).
- **SPLIT-1:** `PlanningLifecycleService` from the 848-line planning core (sub→core).
- **SPLIT-3:** `locations.service.ts` → `LocationPdokService` + `LocationContactPersonsService`.
- **SPLIT-5 / SPLIT-4:** extract `buildContext` from generated-documents; `QuoteTemplateAssetsService` from quote-templates.

### Frontend — FE-2..5, 7, 8, 9, 12..14, 16, 17
- **FE-2/3/4/5:** replace `apiClient.get`-in-`useEffect` with query hooks (kills the duplicate `/users` fetch in projects-detail + add-follower-modal; the two debounced search inputs → `useQuery`). Removes most of the projects-module `any`s (FE-17).
- **FE-7/8/9:** sweep ~87 inline `toLocale*` date calls → `lib/format` (promote `formatDateTimeLong`); add `getContactName` (≈10 reimplementations); replace remaining local status maps in `planning-public-page` with `lib/status`.
- **FE-12/14/13:** split `document-preview-modal` (721) into per-MIME renderers, `search-page` (726) column-builders, `organization-settings-page` (841) remaining 4 inline tabs.
- **FE-16:** split the 2487-line `types/index.ts` monolith by domain behind a barrel.

### Deferred by design (risk/value)
- **PERF-6 (sync push/resolve batching):** real win on large PWA sync batches but **high risk** (conflict semantics + parent/child ordering) — schedule deliberately with focused tests.
- **CONV-9:** inspection-domain ad-hoc composite-where FK checks are correct; converting to `assertSameOrg` is consistency-only.
- **Asset/Photo standalone `@@index([orgId])`** are now left-prefix-redundant with the new composites; **`Favorite.orgId`** index is effectively unused. Minor write-amplification cleanup, batchable with the next migration.

## Incidental findings (worth a follow-up)

- **Projects controller returns entities unwrapped** (no `{success,data}` envelope) unlike notes/requests/quotes — a pre-existing FE/BE contract inconsistency (surfaced while writing the cross-tenant tests).
- **`quotes.e2e` "delete fails for non-CONCEPT"** is fragile: it `.find()`s the seed quote `OFF-2026-0001` on **page 1** of an unpaginated list, so it breaks once enough quotes accumulate (e.g. after repeated local e2e runs). Reseed restores it; ideally the test should query by id/filter instead of relying on list order. (General reminder: e2e shares a DB; `pnpm db:seed` clears leftover fixtures.)

## Final status

`dev` is green: **API unit 1206 · API e2e 629 · portal vitest 206 · `turbo run build` 4/4**. Migration chain is clean
and replayable (`prisma migrate dev`, never `db push`).
