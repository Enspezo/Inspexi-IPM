# Refactor & Query-Optimization — Summary

> Final report for the codebase-wide refactor/perf track. Audit in `AUDIT.md`, sequenced plan in `PLAN.md`.
> All work shipped as small, independently-reviewed PRs merged to `dev`.

## Outcome at a glance

**11 PRs merged to `dev`**, covering every planned area: security, indexes, query-perf, convention/dedup, and frontend.

| Suite | Baseline (Fase 0) | After |
|---|---|---|
| API unit | 1205 / 79 suites | **1211 / 80** (+6 tests) |
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
| [#60](https://github.com/Enspezo/Inspexi-IPM/pull/60) | dedup | `assertSystemRowManageable` single-sources the system/org config-row rule across 8 services (DUP-2). |
| [#61](https://github.com/Enspezo/Inspexi-IPM/pull/61) | frontend | projects-detail + add-follower-modal `/users` fetch → shared `useUsers()` hook (FE-2/3; kills duplicate fetch + `any`s). |
| [#62](https://github.com/Enspezo/Inspexi-IPM/pull/62) | dedup | `generateOrgSequentialNumber` (projects+quotes delegate; +5 unit tests) (DUP-4). |

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
- `assertSystemRowManageable` single-sources the config-row system/org rule across 8 services (#60, DUP-2).
- `generateOrgSequentialNumber` single-sources per-org number generation (projects+quotes) with unit tests (#62, DUP-4).
- Frontend `formatFileSize` (5 local `formatBytes` copies removed), `useConfirm` (last `window.confirm` removed), `@/lib/format` extended to GB/TB (#58); `/users` dropdowns via shared `useUsers()` (#61).
- Existing convention adoption confirmed already-good by the audit: `paginate`, `orgScope`, `assertFound`,
  `assertSameOrg`, `common/auth/roles`, audit `AUDITED_ENTITIES`, `lib/status`/`lib/format`, `tenantStorage`.

---

## Reported but NOT done (for later)

Prioritized, with audit IDs. Each is scoped in `AUDIT.md` / `PLAN.md`.

### Dedup / conventions (backend)
- **DEDUP-1 + DEDUP-2 + PERF-7/8 (high value, but BEHAVIOR-VISIBLE — needs a display-format decision):** `enrichWithEntityNames` is duplicated across **5 copies** (tasks/notes/documents/search ×2) with real display **drift**. The catch on closer inspection: the existing "canonical" `common/audit` `ENTITY_DISPLAYS` is actually *worse* for some types (Project would drop its title, showing only the number; Contact gains an email fallback) — so consolidating changes user-visible strings on **6 surfaces** (tasks/notes/documents/search/favorites/audit). Not a mechanical dedup; pick the desired per-type display format first, then consolidate + add per-model `select` (kills the audit/favorites over-fetch, PERF-7/8).
- **CONV-5/8 (low value):** `search.service.ts` hand-rolls `Promise.all([findMany,count])` in 8 methods → `paginate` (cosmetic; `select`/`orderBy` have weak test coverage and no search e2e, so poor cost/benefit); scattered manual `NotFoundException` → `assertFound` (some have `isDeleted` checks that don't fold cleanly). CONV-6 (search local `orgScope` shadow) is a trivially-safe follow-up.
- **DUP-5/6 (low value):** centralize the Word/DOCX MIME constant (3+ copies) into `@/common/constants/mime-types.ts`; add a backend `formatDateNL` (~6 inline copies).
- **client-realm `requireOrg(orgId)`** in `client-auth` + `client-inspections` (orgId-variant, different message) — a small `requireOrgId` dedup left out of #57 by design.

### Splits (backend) — SPLIT-1..5
- **SPLIT-2:** extract the validation engine from `measurement-sheet-records.service.ts`. NB on closer inspection it's not a trivial copy-out — the engine methods' parameter types use `ReturnType<typeof this.getRecordInOrg>`/`this.getTemplateWithDetails`, so a clean extraction first needs shared snapshot/record type aliases (e.g. `Prisma.<Model>GetPayload`).
- **SPLIT-1:** `PlanningLifecycleService` from the 848-line planning core (sub→core).
- **SPLIT-3:** `locations.service.ts` → `LocationPdokService` + `LocationContactPersonsService`.
- **SPLIT-5 / SPLIT-4:** extract `buildContext` from generated-documents; `QuoteTemplateAssetsService` from quote-templates.

### Frontend — FE-4, 5, 7, 8, 9, 12..14, 16, 17
- **FE-4/5:** replace remaining `apiClient.get`-in-`useEffect` with `useQuery` (`link-entities-modal`; the two debounced contact/planning search inputs). (FE-2/3 — the duplicate `/users` fetch — shipped in #61.)
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

`dev` is green: **API unit 1211 · API e2e 629 · portal vitest 206 · `turbo run build` 4/4**. Migration chain is clean
and replayable (`prisma migrate dev`, never `db push`).

> **Status note (11 PRs in).** The high- and medium-value *safe* work is done. What remains is either **behavior-visible**
> (DEDUP-1 entity-name display — needs a per-type format decision across 6 surfaces), **cosmetic with weak coverage**
> (CONV-5 search→paginate), **larger/fiddlier** (the splits, esp. SPLIT-2's type coupling), or **high-risk** (PERF-6 sync
> batching). Each is scoped above so it can be picked up deliberately rather than rushed.
