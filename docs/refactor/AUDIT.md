# Refactor & Query-Optimization Audit — InspeXi-Beheer

> **Fase 0 deliverable.** Read-only audit produced by 5 parallel Opus subagents (perf, indexes,
> conventions/dedup, backend structure, frontend). No functional code was changed to produce this.
> Findings carry a stable ID (PERF-/IDX-/CONV-/DEDUP-/SPLIT-/DUP-/FE-) referenced from `PLAN.md`.
> Line numbers are accurate as of audit time (branch `dev`, after PR #51) — re-verify before editing.

## Baseline (measured)

| Suite | Result | Notes |
|---|---|---|
| API unit (`pnpm test`) | **1205 passed / 79 suites / ~17s** | CLAUDE.md's "587" is stale. Logged errors are intentional negative-path tests. |
| API e2e (`pnpm test:e2e`) | **611 passed / 42 suites / ~34s** | serial, maxWorkers=1, shared DB. CLAUDE.md's "154" is stale. |
| Build (`turbo run build`) | **4/4 successful** (fully cached) | api + portal + client-portal + convert-api |
| Lint | not runnable repo-wide | eslint referenced in scripts but not installed/configured (see memory `lint-not-configured`). Verification = `tsc --noEmit` + build. |

**Scale:** 4 apps, ~60 API modules, 130 Prisma models, 172 existing `@@index`, 3800-line schema.

**Overall health:** the codebase is in **good** shape. Batching (`findMany({ id: { in } })`), `paginate()`,
`_count`, `groupBy`/`aggregate`, and the `@/common` utilities (`orgScope`/`assertFound`/`assertSameOrg`) are
widely adopted. There is essentially **no classic dead code** (no `.old/.bak`, no commented-out blocks, no
unreferenced exports of note). The real value clusters in: a handful of genuine **N+1 / sequential-await**
hotspots, **missing indexes** on foundation/sync tables, **4 cross-tenant FK-validation gaps** (security),
**duplicated guard/helper logic** across services, and **localized frontend** cleanups (one broken feature).

---

## A. Backend query / performance

| ID | Location | Category | Impact / Risk / Effort | Fix |
|---|---|---|---|---|
| **PERF-1** | `notifications/notifications.service.ts:59-139` | N+1 | High / Med / M | `doDispatch` loops recipients, 2–4 queries each (prefs + roles + group-prefs + email). Batch `notificationPref.findMany({ userId:{in} })` + `user.findMany({ id:{in}, select })` + one group-pref query; build prefs in memory; `notification.createMany`. |
| **PERF-2** | `portal-stats/portal-stats.service.ts:66-111` | sequential-await | High / Low / S | 6 independent `count()` awaited serially on the dashboard landing endpoint → `Promise.all`. |
| **PERF-3** | `portal-stats/portal-stats.service.ts:132-155` | N+1-in-loop | Med / Low / S | `for` loop issues 8 weekly `count()` → `Promise.all` (or `groupBy`). |
| **PERF-4** | `portal-stats/portal-stats.service.ts:167-232` | sequential-await | Low / Low / S | `recentInspections` + `recentContacts` independent → `Promise.all`. |
| **PERF-5** | `inspection-plans/inspection-plans.service.ts:201-213,258-270` | sequential-await | Med / Low / S | 8 independent pre-write validations (`assertSameOrg`×5 + norm/template/lookup) awaited serially in create/update → `Promise.all`. |
| **PERF-6** | `sync/sync.service.ts:139-155,248-281` | N+1-in-loop | Med (High on big batches) / **High** / L | `push`/`resolve` process changes one-at-a-time. Pre-fetch existing rows + parent orgIds per group; parallelize within a group. **High risk** (conflict semantics + parent/child ordering) — defer/schedule. |
| **PERF-7** | `audit-log/audit-log.service.ts:142-144` | over-fetch | Med / Med / M | FK→name batch resolver pulls full rows (no `select`). Derive a per-model `select` from the display fns. |
| **PERF-8** | `favorites/favorites.service.ts:162-173` | over-fetch | Low-Med / Med / M | Same as PERF-7; share the select-map. |
| **PERF-9** | `documents/`, `tasks/tasks.service.ts:233-235`, broad | sequential-await | Low / Low / M | Sweep create/update paths with ≥2 independent `assertSameOrg` into `Promise.all`. |
| **PERF-10** | `users/users.service.ts` `findAll` | unbounded + over-fetch | Med / Med / S-M | `GET /users` is unbounded + `include:{organization:true}` full row per user; backs `useUsers()` dropdowns. Use `select` (org → `{id,name}`) / route dropdowns to slim `GET /users/selectable`. |
| **PERF-11** | `contacts/contacts.service.ts:78-92` | over-fetch | Low / Low / S | List `include:{addresses:true}` pulls all addresses; mirror search's `where:{isPrimary},take:1,select`. |

**Verified FINE (no action):** `search.service.ts` (parallel + narrow selects + count), all `enrichWithEntityNames`
(batched), `prisma.service.ts` audit middleware (the per-update findUnique is inherent; **do not** convert to
client calls — breaks the `$executeRaw` recursion guard), assets/findings lists, `client-inspections`,
`buildContext`, `paginate()`.

## B. Database indexes

| ID | Model (table) | Columns | Impact | Justification (query) |
|---|---|---|---|---|
| **IDX-1** | User (`imp_users`) | `(orgId)` / `(orgId,isDeleted)` | **High** | **Zero indexes** today (only unique email/icalToken). `users.service` findAllByOrg/findSelectable + 14 `user.findMany` sites. |
| **IDX-2** | RefreshToken (`imp_refresh_tokens`) | `(tokenHash)` | **High** | `auth.service.ts:82-87,123-128` findFirst/updateMany by `tokenHash` on every refresh/logout — unindexed. |
| **IDX-3** | AuditLog (`imp_audit_logs`) | `(entityType,entityId,createdAt)` | Med | AuditHistory on every detail page filters entityType+entityId, orders by createdAt. Supersedes the existing 2-col index. |
| **IDX-4** | InspectionPlan | `(orgId,updatedAt)` | Med | PWA `/sync` pull delta (`sync.service.ts:77-88`). |
| **IDX-5** | Asset | `(orgId,updatedAt)` | Med | Same sync pull; highest-volume inspection child. |
| **IDX-6** | Finding | `(orgId,statusCode)` | Med | Dashboard open/critical-findings count (`portal-stats.service.ts:96-100`). |
| **IDX-7** | InspectionClientAccess | `(clientUserId)` | Med | Client-portal "my inspections" (`client-inspections.service.ts:40-42`); both uniques lead with inspectionPlanId. |
| **IDX-8** | Quote | `(orgId,createdBy)` | Low-Med | "My quotes" filter (`quotes.service.ts:47-53`) — gate on UI usage. |
| **IDX-9** | Photo | `(orgId,createdAt)` | Low-Med | PWA `/sync` photo delta. |

**Cleanup (redundant — remove, don't add):** `ClientUser.email` `@@index` (line ~3601) duplicates `@unique email`;
`ClientMagicLink.token` `@@index` (~3636) duplicates `@unique token`; `Favorite.orgId` index is effectively dead
(no query filters Favorite by orgId alone).
**DO NOT ADD:** text-search columns (use `contains`/ILIKE — need pg_trgm GIN, out of scope for `@@index`); lookup
tables (tiny, already `(orgId,code)`+`(orgId,isActive)`); `SyncQueue` (transient; watch only).

## C. Conventions & duplication (SECURITY items here)

> **SECURITY — cross-tenant FK injection.** Create/update accepts an FK UUID and writes it without verifying it
> belongs to the caller's org. Reference fix: `tasks.service.ts` `validateEntityRef` + `assertSameOrg`.

| ID | Location | Sev | Attack |
|---|---|---|---|
| **CONV-1** | `projects/projects.service.ts:129-131,140-150,179-181` | **High** | Org A injects org B's `contactId/locationId/projectManagerId`; worse, `requestId/quoteId` do an **un-scoped UPDATE** → cross-tenant write on another tenant's request/quote. (`assignEntities` at :230 scopes correctly — proves the omission.) |
| **CONV-2** | `notes/notes.service.ts:228-260` | **High** | Polymorphic `entityType/entityId` written unvalidated. Mirror documents' `entityRef`+`assertSameOrg`. Depends on DEDUP-2. |
| **CONV-3** | `requests/requests.service.ts:220` + update | Med | `assignedTo` unvalidated (create+update); contactId/locationId already guarded. |
| **CONV-4** | `quotes/quotes.service.ts:116,157-158` | Med | `requestId` unvalidated (create); contactId/locationId unvalidated (update) — asymmetric with create. |

**Convention adoption gaps (non-security):**
- **CONV-5** `search.service.ts` (8 methods): manual `Promise.all([findMany,count])`+skip/take → `paginate`. Med/M.
- **CONV-6** `search.service.ts:51`: local `orgScope` shadows the shared helper → import `@/common`. Low/S.
- **CONV-7** scattered inline `{orgId:user.orgId}` / SUPERUSER-null create-data idioms (notes:255, tasks:247, notifications:246, …) → shared helper. Low/S.
- **CONV-8** manual `if(!x) throw NotFoundException` (requests:84/106/178/185, quotes:84, notes:218/234, projects) → `assertFound`. Low/M.
- **CONV-9** inspection-domain ad-hoc composite-where FK checks (findings/assets/work-orders) — correct, could use `assertSameOrg` for consistency. Low/M.

**Duplicated mappings (single-source targets):**
- **DEDUP-1 (High)** `enrichWithEntityNames` duplicated across **5 copies**: `tasks.service.ts:38-127`, `notes.service.ts:29-129`, `documents.service.ts:64-210`, `search.service.ts:419-488` + `:490-585`. **Real drift**: Contact email-fallback, Project `number — title` vs `number`, Location name vs address, search omits PROJECT/USER. Single-source exists: `common/audit` `ENTITY_DISPLAYS`/`displayReference`/`delegateFor` (favorites already uses it).
- **DEDUP-2 (Med)** entityType→{delegate,NL-label} map duplicated: `documents.service.ts:217-249` (`entityRef`), `tasks.service.ts:210-226` (`validateEntityRef`), `documents.service.ts:577-653` (recipients); **notes lacks it** → cause of CONV-2.
- **DEDUP-3 (Low, already mitigated)** notification model/label FE↔BE split is intentional + test-guarded; the "labels in 3 places" is already single-sourced in `lib/notifications.ts`. Only a shared workspace package would remove the FE/BE split — defer.
- **DEDUP-4 (Low)** entity-type allow-lists redefined per module — mostly fine.

**Verified single-sourced already:** role groups (`common/auth/roles.ts`), inspection status constants, `LOOKUP_KIND`, audit model/table/allowed (collapsed into `AUDITED_ENTITIES`).

## D. Backend structure (splits) & duplicated helpers

**Duplicated helper logic (highest structural value):**
- **DUP-1 (High/S)** `private requireOrg(user)` copy-pasted in **12** services (+ ~11 `ForbiddenException('Geen organisatie gekoppeld')` variants) → `@/common`.
- **DUP-2 (High/M)** config-template guard trio `assertManageable` (10×) / `assertConcept` (3×) / `assertVisible` (3×) across lookups/checklists/templates/types/categories → shared DI-free helpers. (This is the lever that lets the config CRUD services stay un-split.)
- **DUP-3 (Med/S)** `checkOrgAccess` byte-identical in planning:138 + projects:51 → fold into DUP-1 PR.
- **DUP-4 (Med/S)** per-org sequential number gen identical in projects:57 + quotes:550 (work-orders is random-based, exclude) → `generateOrgSequentialNumber` helper.
- **DUP-5 (Low/S)** Word/DOCX MIME constant defined 3×+ → `@/common/constants/mime-types.ts`.
- **DUP-6 (Low/S)** inline nl-NL date formatting ≥6 spots in API → `common` `formatDateNL`.

**Split candidates (only real seams):**
- **SPLIT-1** `planning.service.ts` (848) → extract `PlanningLifecycleService` (assign/accept/reject/reschedule/complete/status + email senders), sub→core. Med/M.
- **SPLIT-2** `measurement-sheet-records.service.ts` (555) → extract DI-free validation engine (`runValidation`/`evaluatePassFail`/`runFinalCheck`/`createTemplateSnapshot`, lines 262-555, no Prisma). **Lowest-risk, cleanest seam.** S-M.
- **SPLIT-3** `contacts/locations.service.ts` (558) → `LocationPdokService` + `LocationContactPersonsService`. Med/M.
- **SPLIT-4** `quote-templates.service.ts` (610) → `QuoteTemplateAssetsService` (DOCX/image/attachment storage). Med/M.
- **SPLIT-5** `generated-documents.service.ts` (760) → extract pure `buildContext` mapper. Med/M.

**NOT recommended to split** (long but cohesive): users, documents, search, checklists, inspection-templates,
document-templates, classification-models, projects, quotes, tasks, work-orders, inspection-plans.
**Dead code:** none found (verified).

## E. Frontend (portal; client-portal is clean)

> `apps/client-portal/src` passes every convention — **all findings are in `apps/portal/src`**.

- **FE-1 (High/S — BROKEN FEATURE)** `quotes/components/quote-detail-attachments-card.tsx:49` reads `localStorage.getItem('accessToken')` which is **never set** (token is in-memory). Attachment download always sends empty Bearer → 401. Use `getAccessToken()` / `lib/download-file.ts`.
- **useEffect-fetch anti-pattern:** **FE-2** `project-detail-page.tsx:106-119` + **FE-3** `projects/components/add-follower-modal.tsx:32-45` both hand-fetch `/users` (FE-3 duplicates FE-2's data) → `useUsers()`. **FE-4** `link-entities-modal.tsx:33-44` → `useQuery`. **FE-5** `contact-search-input.tsx:90-119` + `planning-search-input.tsx:104-133` → `useQuery`.
- **Shared-lib gaps:** **FE-6** `formatBytes` reimplemented **5×** → `formatFileSize`. **FE-7** `formatDate` reimplemented 7× + ~87 inline `toLocale*` → `lib/format` (promote `formatDateTimeLong`). **FE-8** `getContactName` reimplemented ~10× → add to `lib/format`. **FE-9** local status/entity maps duplicate `lib/status.ts` (planning-public, document-preview-modal). **FE-10** `documents-section.tsx:81` `window.confirm` → `useConfirm()` (last one).
- **Splits:** **FE-12** `document-preview-modal.tsx` (721) → per-MIME renderers. **FE-13** `organization-settings-page.tsx` (841) → 4 inline tabs to components. **FE-14** `search-page.tsx` (726) → column builders + TabContent. **FE-15** under-decomposed planning/quote-editor pages.
- **Types:** **FE-16** `types/index.ts` 2487-line monolith → split by domain + barrel. **FE-17** 26 `as any` (clustered in projects module; mostly auto-fixed by FE-2…4).
- **Dead code:** **FE-18** `planning-calendar-view.tsx:128,134` `getItemColor` (unused export) + `_statusLabel`.

---

_See `PLAN.md` for the sequenced PR plan with dependencies and shared-file conflicts, and `SUMMARY.md`
(end of project) for what shipped vs. what was deferred._
