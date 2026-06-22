# Refactor & Query-Optimization — PR Plan

> Sequenced, incremental PR plan derived from `AUDIT.md`. Each PR: branch from **current `dev`**, implement,
> `tsc`/`build`/relevant tests green, `gh` PR → `dev`, `code-review` (+`security-review` where flagged) subagent,
> then self-merge + delete branch + tick the box here. Status: ☐ todo · ⧖ in progress · ☑ merged.
>
> **Shared-file rule:** PRs are executed **sequentially** (rebase each branch on latest `dev`), so cross-PR file
> overlaps are not merge hazards — but the "touches" column documents them so reviewers know the history.

## Baseline (Fase 0)

- API unit: **1205 / 79 suites / ~17s** · API e2e: **611 / 42 suites / ~34s** · build: **4/4 green** · lint: n/a (not configured).
- Perf evidence method: **static query-count before/after** from the diff (e.g. "6 serial `count()` → 6 in one
  `Promise.all` round-trip"; "N+1 over R recipients → 3 batched queries"). Index PRs cite the query + the
  seq-scan→index-scan change. (Full wall-clock timing needs the auth+tenant flow against a running server; query
  counts are the reliable, reviewable metric and are what the prompt asks for.)

---

## Wave 0 — Docs
- ☑ **PR-1 `docs/refactor-audit-plan`** — `AUDIT.md` + `PLAN.md` (+ baseline). No code. _This PR._

## Wave 1 — Security (ship first — real cross-tenant vulnerabilities)
- ☑ **PR-2 `fix/cross-tenant-fk-validation`** — CONV-1/2/3/4. [#53](https://github.com/Enspezo/Inspexi-IPM/pull/53) (merged). **security-review required.**
  - projects (contactId/locationId/projectManagerId + scope request/quote link updates), notes (polymorphic entityId), requests (assignedTo create+update), quotes (requestId create; contactId/locationId update).
  - **Behavior change (documented):** cross-tenant FK writes now → 403/404 instead of succeeding. Add cross-tenant e2e cases per gap.
  - Touches: `projects/`, `notes/`, `requests/`, `quotes/` services + `cross-tenant.e2e-spec.ts`.

## Wave 2 — Indexes (isolated to schema; clear DB win)
- ☑ **PR-3 `perf/db-indexes`** — IDX-1..9 + remove redundant `ClientUser.email`, `ClientMagicLink.token` indexes. [#54](https://github.com/Enspezo/Inspexi-IPM/pull/54) (merged). (`Favorite.orgId` + Asset/Photo standalone `orgId` left in place — note in SUMMARY.)
  - One `prisma migrate dev --name perf_indexes` (run from `apps/api/`). Additive `CREATE INDEX` + `DROP INDEX`. Update seed only if needed (no data shape change → not needed).
  - **Before/after:** each index cites the unindexed query it serves (e.g. User has **zero** indexes; RefreshToken `tokenHash` lookup every refresh).
  - Touches: `schema.prisma`, `prisma/migrations/`.

## Wave 3 — Backend perf quick wins
- ☑ **PR-4 `perf/dashboard-and-validation`** — PERF-2/3/4 (portal-stats → `Promise.all`) + PERF-5 (inspection-plans create/update validations → `Promise.all`). [#55](https://github.com/Enspezo/Inspexi-IPM/pull/55) (merged).
  - Before/after: dashboard 6+8+2 serial queries → 3 `Promise.all` batches; plan create 8 serial validations → 1 batch.
  - Touches: `portal-stats/`, `inspection-plans/`.
- ☑ **PR-5 `perf/notifications-dispatch`** — PERF-1. Batch prefs/users/group-prefs + `createMany`. [#56](https://github.com/Enspezo/Inspexi-IPM/pull/56) (merged).
  - Before/after: 2–4 queries × R recipients → 3 batched + 1 `createMany`. Keep dispatch fire-and-forget. Unit-test recipient/pref resolution unchanged.
  - Touches: `notifications/notifications.service.ts`.
- ☐ **PR-6 `perf/list-endpoints`** — PERF-10 (`users.findAll`: `organization:{select:{id,name}}`, optional pagination keeping flat-array) + PERF-11 (contacts list addresses `where isPrimary, take 1, select`).
  - **Behavior change (documented):** `GET /users` org payload trimmed to `{id,name}`; **verify FE** `useUsers()` consumers don't read other org fields (FE in same PR if so).
  - Touches: `users/`, `contacts/` services (+ FE check).

## Wave 4 — Dedup & common helpers (backend)
- ☑ **PR-7 `chore/common-org-guards`** — DUP-1 (`requireOrg`, 11 user-variant copies) + DUP-3 (`checkOrgAccess`, 2 copies) → `@/common`. [#57](https://github.com/Enspezo/Inspexi-IPM/pull/57) (merged). Behavior identical. (client-auth/client-inspections `requireOrg(orgId)` orgId-variant left — note in SUMMARY.)
  - Touches: `common/` + 13 services. Broad but mechanical.
- ☑ **PR-8 `chore/common-config-guards`** — DUP-2: `assertSystemRowManageable` single-sources the system/org manageability rule across 8 config services (`assertManageable` bodies → thin delegates, exact NL messages preserved). [#60](https://github.com/Enspezo/Inspexi-IPM/pull/60). _Scope: the dominant `assertManageable` pattern only; `assertConcept`/`assertVisible` and the lookups/measurement-sheet variants (different semantics) left — see SUMMARY._
  - Touches: `common/` + 8 config services.
- ☐ **PR-9 `chore/dedup-entity-enrichment`** — DEDUP-1 + DEDUP-2 + PERF-7/8 (shared `enrichEntityNames` over `ENTITY_DISPLAYS` with per-model `select`; shared `ENTITY_REF` map).
  - **Behavior change (documented):** display strings in tasks/notes/documents/search normalize to the canonical (favorites/audit) rendering (Contact email-fallback, Project `number` only, Location address, search gains PROJECT/USER). Snapshot/adjust affected tests.
  - Touches: `common/`, `tasks/`, `notes/`, `documents/`, `search/`, `favorites/`, `audit-log/`.
- ☐ **PR-10 `chore/conventions-sweep`** — CONV-5 (search → `paginate`) + CONV-6 (search `orgScope`) + CONV-8 (`assertFound` where a clean swap). Low risk.
  - Touches: `search/`, requests/quotes/notes/projects (small).
- ☐ **PR-11 `chore/common-misc`** — DUP-4 (`generateOrgSequentialNumber`, projects+quotes; unit-test) + DUP-5 (`@/common/constants/mime-types.ts`) + DUP-6 (`formatDateNL`). Optional/low priority.

## Wave 5 — Backend splits (only real seams)
- ☐ **PR-12 `refactor/extract-measurement-validation`** — SPLIT-2 (DI-free validation engine). Lowest risk; pure functions become unit-testable.
- ☐ **PR-13 `refactor/split-planning-lifecycle`** — SPLIT-1 (`PlanningLifecycleService`, sub→core).
- ☐ **PR-14 `refactor/split-locations-service`** — SPLIT-3 (`LocationPdokService` + `LocationContactPersonsService`).
- _(SPLIT-4 quote-template-assets, SPLIT-5 generated-document-context — defer to SUMMARY unless time permits.)_

## Wave 6 — Frontend
- ☑ **PR-15 `fix/fe-attachment-download-and-cleanup`** — FE-1 broken download (in-memory `getAccessToken()` + `ok` check) **plus** FE-6 (`formatFileSize` ×5), FE-10 (`useConfirm`), FE-18 (dead code). [#58](https://github.com/Enspezo/Inspexi-IPM/pull/58).
- ☐ **PR-16 `refactor/fe-query-hooks`** — FE-2/3/4/5 (useEffect-fetch → query hooks) + FE-17 `any`. _Deferred → SUMMARY._
- ☐ **PR-17 `refactor/fe-shared-lib`** — FE-7 (`formatDate` sweep) + FE-8 (`getContactName`) + FE-9 (status maps). _Remaining items deferred → SUMMARY (FE-6/10/18 shipped in PR-15)._
- ☐ **PR-18 `refactor/fe-splits`** — FE-12 / FE-14 / FE-13 / FE-16. _Deferred → SUMMARY._

---

## Dependencies & notes
- **PR-2 first** (security). PR-9 (DEDUP-2 `ENTITY_REF`) would have been a cleaner base for CONV-2, but to avoid
  blocking the security fix on a refactor, PR-2 validates notes' entityId with a local `assertSameOrg` switch
  (mirrors tasks); PR-9 then consolidates it into the shared map.
- **Waves are independent** except: PR-9 builds on the `@/common` additions style of PR-7/8 (not a hard dep).
- **PERF-6 (sync batching)** and **CONV-9** are **deferred by design** (high risk / low value) → documented in SUMMARY.
- Migrations: only via `cd apps/api && npx prisma migrate dev` — never `db push`. Keep the chain replayable.
- After each merge: rebase the next branch on `dev`, re-run the relevant suite, tick the box + add the PR link here.
