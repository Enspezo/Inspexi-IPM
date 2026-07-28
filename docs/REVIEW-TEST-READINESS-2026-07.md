# Test-Environment Readiness Review — July 2026

Branch: `chore/test-env-readiness` (off `dev`, up to and including PR #126).
Goal: review the whole codebase, refactor where the review points, and make it
demonstrably ready to roll out to a first shared **test** environment.

Companion documents:
- `docs/TEST-ENV-CHECKLIST.md` — the practical, code-traced stand-up checklist.
- This file — what was found, what was fixed, what was left open (and why).

## 1. Verdict

**Ready for a first test deployment, with a short list of deploy-time decisions.**
No BLOCKER-severity issues were found. The dominant real risk was a cluster of
**cross-tenant FK-injection leaks** (writes that skipped the codebase's own
`assertSameOrg` invariant and then read the foreign record back through a response
`include`); all of these are now closed. The remaining open items are deployment
decisions (reverse-proxy/subdomain scheme, single-vs-multi hop) and one product
question about the four-eyes review semantics — none block bringing up a test
environment, and each is called out in §4.

## 2. Verification (all green)

| Check | Result |
|---|---|
| `npx turbo run build` (root, 6 packages) | ✅ pass |
| API unit tests (`apps/api pnpm test`) | ✅ 121 suites / 1810 tests |
| API e2e (`pnpm test:e2e`, serial) | ✅ 57 suites / 941 tests |
| Portal unit tests (`apps/portal pnpm test`) | ✅ 30 files / 313 tests |
| `tsc --noEmit` — portal + client-portal | ✅ 0 errors |
| Migration chain replay on an empty DB (`prisma migrate deploy`) | ✅ clean; ltree + pg_trgm extensions, both AssetNode path triggers, GiST index `imp_asset_nodes_path_gist`, partial-unique `imp_ai_review_runs_pending_plan_key`, 158 tables |
| `prisma migrate diff` (migrations vs schema) | ✅ only the two intentional hand-maintained deltas — **no `db push` drift** |
| Browser smoke test (branch build) | ✅ see §5 |

## 3. What was fixed

Eight small, logical commits. Each fix follows the existing conventions
(`assertSameOrg`/`assertAllSameOrg`, `@RequiresFeature`, `getStatusConfig`, etc.)
and adds/updates unit coverage.

### 3.1 Security & multi-tenancy — cross-tenant FK-injection (HIGH) — `1710b04`
Several write paths persisted caller-supplied foreign-key UUIDs without the
`assertSameOrg` check that sibling paths already run, then read the foreign record
back through the response `include` — leaking another org's user emails,
contact/location PII or product catalog, and (for followers) enrolling a foreign
user who then received this org's notifications. Exploiting them needs a victim
org's v4 UUID (so not an unauthenticated leak), but they violate the tenant-isolation
invariant and had to close before multiple tenants share the environment.

- **SEC-1** `planning.update` — validate re-pointed `locationId`/`contactPersonId`/`productId`.
- **SEC-2** project & planning followers — validate a supplied `userId`.
- **SEC-3** price-table/quote/work-order `setLines` — validate every line `productId`.
- **SEC-4** quote-templates — validate `sendEmailTemplateId`/`acceptedEmailTemplateId`/`emailTemplateId`/`assigneeUserId`.
- **SEC-5** contacts — validate `ownerId`.
- **SEC-6** products — validate `productGroupId`.
- **SEC-7** assets/inspection-locations `reorder` — verify every id is in the plan tree; custom-fields `reorder` — org-scope the id set before the bulk `sortOrder` update (it previously ignored its `orgId` parameter entirely).

### 3.2 Sync guard bypass + FK parity (HIGH) — `e42a8f8`
- **SYNC-1** `sync.service.resolve()` re-applied conflict data — including a
  client-supplied `mergedData` — through a bare update, skipping the FK / user-FK /
  tree-membership checks and the four-eyes review gate that `processChange()` runs
  on push. A user could force a conflict on their own plan, then resolve it with a
  merge that injected a foreign-org FK or flipped `statusCode` to `completed`/`approved`.
  `resolve()` now routes the chosen data through the same guard pipeline (the guards
  no-op on absent fields, so partial merges stay valid).
- **SYNC-2** the plan sync-mapper whitelisted `contactId`/`projectId`/`locationId`
  but org-validated only `installationResponsibleId`. Added plain org-checks for those
  three. `inspectionTemplateId` legitimately allows system rows (`orgId` null), so it is
  guarded system-aware **at the render sink** instead: the generated-documents template
  lookup is now scoped through the `inspectionTemplate` relation to the plan's own org or
  a system template, closing the "foreign template renders into this org's document" chain.

### 3.3 Security hardening (MEDIUM/LOW) — `9d0ff72`
- **SEC-10** Resend webhook: fail **closed** in production when `RESEND_WEBHOOK_SECRET`
  is absent (it is `@Public` and writes across orgs); added a 30/min throttle. Non-production keeps the lenient path.
- **SEC-11** client document signing: require an explicit `InspectionClientAccess`
  grant with `canSign=true` — a view-only grant or contact-only access can no longer
  complete a signature slot. The magic-link flow always sets `canSign`, so the normal client flow is unchanged.
- **SEC-12** photo upload: added a multer-level `fileSize` limit so oversized bodies are rejected before buffering.
- **SEC-14** VAT proxy: gated behind `@RequiresFeature('BASIS_CRM')` like the sibling geocoding/kvk proxies.
- **SYNC-5** signed documents: block `updateEditedContent` once a document is `SIGNED` (not only `FINALIZED`) so content cannot change under the collected signatures.

### 3.4 Deploy readiness — `79f82b7`
- **DEP-2** storage boot: instantiate only the selected provider — the R2 provider's
  constructor `getOrThrow`s the R2_* keys, which crashed boot on a `local` deployment that omitted them; now `new`'d lazily only for `STORAGE_DRIVER=r2`.
- **DEP-3** `@Public() GET /api/v1/health` (light `SELECT 1`) for load balancers.
- **DEP-10** `app.enableShutdownHooks()` — Prisma/Puppeteer shut down cleanly on SIGTERM.
- **DEP-9** Swagger `/api/docs` gated behind `SWAGGER_ENABLED` (off in production by default).
- **DEP-1** `prisma:migrate:deploy` / `db:migrate:deploy` scripts for the safe non-interactive migration path.
- **DEP-5** client-portal password resets use `CLIENT_PUBLIC_URL` (fallback `PUBLIC_URL`) instead of the staff portal.
- **.env**: documented `NODE_ENV` (DEP-8), `API_BASE_URL` (DEP-7), `SWAGGER_ENABLED`, `CLIENT_PUBLIC_URL`, `PDF_MAX_CONCURRENCY` + `MEETMIDDEL_KALIBRATIE_DREMPEL_DAGEN` (DEP-15); noted R2 keys may be empty for local (DEP-2); dropped stale `CLIENT_PORTAL_PORT` (DEP-12); added `apps/portal/.env.example` (DEP-16).

### 3.5 Data layer — `ce4bd9e`
- **DB-1** availability template name: defensive `P2002 → 409` wrapper on create/update.
  (The common create→delete→recreate path was already safe — `remove()` mangles the
  name on soft-delete — so this is a belt-and-suspenders mapping to a clean NL 409.)

### 3.6 Frontend + tests — `62ebd7a`, `3bcaf08`, `a5dd69d`
- **FE-2** dropped the local status maps in the public planning page and the hardcoded
  request-kanban labels/colours; both now source from the canonical `lib/status.ts`.
- **PR-125** `getNotificationRoute` resolves `user` (→ `/users/:id`) and
  `availabilityException` (→ `/my-availability`) so availability notifications are clickable.
- **PR-126** cap the AI-review PENDING poll at 10 min (the server's stale-reclaim window) instead of polling forever.
- Added a `planning-sessions.service.spec` for the session-variant availability wiring (PR-125).
- Updated the assets/inspection-locations reorder specs for the new SEC-7 tree-membership guard.

## 4. Deliberately left open (documented, not silently changed)

Per the task instruction to confirm behaviour changes rather than change them silently,
the following were **not** changed and are recorded here as decisions/follow-ups.

### 4.1 Product decision — four-eyes reviewer ≠ author (PR-126, MEDIUM)
`inspection-plans.service.review()` sets `reviewedAt`/`approvedAt` without checking that
the acting user differs from `plan.assignedTo`/`createdBy`, and does not require
`user.id === plan.reviewerId` — any `REVIEW_ROLES` user can review any pending plan,
including one they are assigned to. The PRD calls this the "vier-ogen-principe" (two
people); as implemented it guarantees "a review happened", not "by a second person".
Partial mitigation: `INSPECTEUR` is excluded from `REVIEW_ROLES`, so pure field
inspectors cannot self-approve. A code comment says it mirrors the original Inspexi-App.
**Decision needed:** is self-review (by a manager who is also the assigned inspector)
acceptable for the test/compliance goal? If not, add a guard in `review()` rejecting
`user.id === plan.assignedTo` (and/or bind review to `plan.reviewerId`). Not changed
because it is a product/compliance call, not a defect.

### 4.2 Deployment decisions (not code)
- **DEP-6 / DEP-11** — `PUBLIC_URL` has no per-org subdomain templating, and the client
  portal must be served on a **single-level** `<slug>.BASE_DOMAIN` host (nested
  `<slug>.klant.BASE_DOMAIN` resolves to no tenant). Choose the reverse-proxy/co-hosting
  scheme before client-portal testing (see checklist §5).
- **DEP-14** — `trust proxy = 1` assumes exactly one proxy hop; ensure a single hop for
  correct per-IP throttling and enumeration-guard attribution.
- **DEP-4** — no API Dockerfile is shipped. The API is a pnpm-workspace app needing Prisma
  + Chromium; a correct image needs `pnpm deploy` and can't be validated in this repo here,
  so a broken/untested Dockerfile was deliberately **not** committed. The checklist §10 gives
  the exact build requirements (Chromium apt packages, `PUPPETEER_EXECUTABLE_PATH`,
  `migrate deploy`, workspace bundling) as a starting point.
- **DEP-13** — `CONVERT_API_KEY` still accepts the literal `change-me-in-production`
  placeholder; generate a real shared key (documented in the checklist).

### 4.3 Lower-priority follow-ups (noted, not fixed)
- **SYNC-2 residual** — the finding sub-FKs (`visualInspectionId`/`measurementRecordId`,
  which are node-scoped, and `findingTemplateId`/`checklistItemId`, which allow system rows)
  are not yet org/tree-validated on the sync push. A naive plain `assertSameOrg` would break
  legitimate system-template/node-scoped sync, so this needs a system/node-aware check
  mechanism. Read-back exposure is limited (node-scoped ids won't match the finding's own node).
- **SYNC-3** — sync `delete` soft-deletes a single node while REST cascades the subtree.
  Confirm the PWA enqueues child deletes, or make sync-delete cascade, before the PWA cutover.
- **SYNC-4** — `convert-api` has only a shared-key guard (no ValidationPipe/throttler/helmet)
  and its LibreOffice timeout leaves orphan `soffice` processes. It must run network-isolated;
  robustness hardening (kill child on timeout, add ValidationPipe) is a follow-up.
- **FE-1** — ~55 portal files format dates inline (`toLocaleDateString('nl-NL')`) instead of
  `@/lib/format`, producing a third, inconsistent date format. This is cosmetic drift, not a
  runtime bug (call sites are non-null or ternary-guarded), and the right helper differs
  per site, making a blanket replace risky. Left as a mechanical follow-up; the full file list
  is in the review notes.
- **Compat wrappers** — `assets` and `inspection-locations` remain in use by the portal
  register/floor-plan pages and `location-images.service` (not PWA-only); a post-cutover
  removal checklist is in the sync review. Do not remove before the PWA cuts over.
- Stale doc note corrected in `CLAUDE.md`: `<StatusBadge>` uses `status=` (not `value=`),
  and `GET /planning` is paginated (not a flat array).

## 5. Browser smoke test (against the branch build)

Ran the compiled branch on isolated ports (API `:3011`, portal `:5183`, client-portal
`:5184`) against the `SEED_DEMO=1`-seeded database, without disturbing another worktree's
dev servers on the standard ports.

- **API boot** — clean start with `STORAGE_DRIVER=local` and empty R2 keys (validates DEP-2);
  `GET /api/v1/health` → `{status:'ok',database:'up'}` (DEP-3); Swagger present under
  `NODE_ENV=development` (gate works); clean SIGTERM shutdown (DEP-10).
- **Staff** — login as `admin@inspexi-demo.nl` → dashboard "Welkom terug, Jan!".
- **Inspection detail** — the plan renders with Overzicht + the **AI-voorcontrole** panel
  (the COMPLETED demo run, 5 items, severity badges, "Bekijk in Assets" deep-links); the
  **Assets** tab renders the full AssetNode tree (LOCATION + ASSET nodes with `LOC-####`/`EI-####`
  numbers and finding counts).
- **by-slug branding** — exposes `aiReviewEnabled`/`inspectionReviewEnabled` but not
  `aiReviewInstructions` (no sensitive leak).
- **Client portal** — magic-link login (`/magic/demo-klant-magic`) → client dashboard
  "Welkom, Demo"; confirmed the link is **single-use** (`used_at` set on first use) with a
  **30-day expiry** (K3 hardening), and the frontend shows a graceful "ongeldig of verlopen"
  state on a consumed link.

## 6. Review scope

Six parallel Opus review streams fed this pass: (1) security & multi-tenancy across all
API modules, (2) deep review of PR #125 (PRD-12 availability) and PR #126 (PRD-13 AI review),
(3) Prisma & data layer (schema vs migration chain, seed, ltree discipline, indexes), (4)
frontend conventions across both portals, (5) sync contract v3 / compat wrappers /
document-generation / convert-api, (6) deploy readiness (which also produced the checklist).
Their raw findings were consolidated, re-verified against the code, and triaged into the
fixes above.
