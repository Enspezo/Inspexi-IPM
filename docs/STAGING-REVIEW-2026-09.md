# Staging-readiness review — September 2026

Code-verified review of `dev` (HEAD `4e7e1ce`, PR #189 merged) ahead of the first
staging deployment, plus the refactor that landed in branch
`refactor/staging-readiness-review`. Companion to `TEST-ENV-CHECKLIST.md`
(environment requirements) and `herstelplan/RUNBOOK-DEPLOY.md` (deploy steps).

Scope reviewed: `apps/api` (security, multi-tenant isolation, config, cron jobs,
code quality of PRD-12…16), `apps/portal`, `apps/client-portal`,
`apps/convert-api`, `packages/*`, Dockerfiles, CI, docs.

---

## 1. What was fixed in this branch

### API — security / staging blockers

| # | Finding | Fix |
|---|---------|-----|
| S1 | **Public routes 403'd on the apex domain.** `FeatureGuard` evaluated the class-level `@RequiresFeature` for unauthenticated requests; on a non-localhost `BASE_DOMAIN` the apex host has no tenant org → every mailed afspraak-, onderteken- and iCal-link failed. Not caught by e2e (runs on `127.0.0.1`). | Guard skips `@Public()` handlers; planning-public, iCal, signature-requests and `voice/status` gate in the *service* against the owner org and bind token lookups to the visited tenant (`publicTenantWhere`). Same pattern as WP-B7 for quotes. |
| S2 | `GET /health` returned 200 with `status: degraded` when Postgres was down → Docker HEALTHCHECK / load balancer never failed. | 503 on the catch path. |
| S3 | No startup validation beyond JWT secrets: missing `PUBLIC_URL` produced `undefined/reset-password?…` links; placeholder `CONVERT_API_KEY` accepted; `NODE_ENV=staging` silently switched *off* every production safeguard (Swagger public, unsigned webhooks, seed allowed). | `validate-config.ts`: unknown `NODE_ENV` always fails; in production `PUBLIC_URL`, `RESEND_API_KEY`, non-placeholder `CONVERT_API_KEY` are required. Use `NODE_ENV=production` on staging. |
| S4 | Four of seven cron jobs had no try/catch and no kill-switch; with >1 replica the quote-expiry job dispatches duplicate notifications. | `SCHEDULER_ENABLED` switch honoured by all schedulers + try/catch. Run cron on exactly one instance. |
| S5 | `trust proxy` hard-coded to 1 hop; PaaS port injection ignored. | `TRUST_PROXY_HOPS`, `PORT` fallback (API + convert-api). |
| S6 | Public token routes relied only on the global 120/min throttle; planning token lookup not tenant-bound. | 30/min on token routes, 10/min on verify-email; tenant binding + `orgId` filter on the shared-document lookup. |
| S7 | Client-realm refresh without cookie returned HTTP 200 `{success:false}`. | 401, like the staff realm. |
| S8 | Repair-session guard skipped the org check when no tenant resolved. | Fails closed outside localhost. |
| S9 | Seed could wipe a remote database when `NODE_ENV` was unset. | Refuses non-local `DATABASE_URL` unless `FORCE_SEED=1`. |
| S10 | Live KvK test key committed in `.env.example`; `KVK_USE_TEST_ENV=true` default. | Key removed, default `false`, warning in production. |
| S11 | convert-api accepted the placeholder key. | Refused when `NODE_ENV=production`. |

### API — correctness / code quality

| # | Finding | Fix |
|---|---------|-----|
| Q1 | **Partial `PATCH /users/:id` and `/users/profile` nulled the home address and default approver** — `'homeStreet' in dto` is always true after `ValidationPipe`. | `dto.field !== undefined` (13 guards) + spec. |
| Q2 | `client-repair complete()`, timesheet `submit()` and the assignment-task creation were multi-step writes without a transaction. | `$transaction`; submit uses a status-guarded `updateMany` (0 rows → 409). |
| Q3 | `/sync` push `update` on a soft-deleted time entry mutated the tombstone. | Idempotent return. |
| Q4 | ISO-week assignment ignored `Organization.timezone` (night-watch honoured it). | Org timezone threaded through. |
| Q5 | AI-agent write tools passed LLM/user-edited args to services `as any`, skipping class-validator. | `validateToolInput()` through the real DTOs. |
| Q6 | Server-side dates rendered in the *process* timezone (UTC in a container) in PDFs and e-mails. | `common/utils/format-date.ts` with explicit `Europe/Amsterdam` + `TZ` in the Dockerfile. |
| Q7 | Duplicated helpers (role checks, `isStaffViewer`, `assertUserInScope`, `escapeHtml`, project-rule block), misuse of `assertFound`, dead DTOs, silently swallowed promise rejections, unbounded AI-review item text. | Deduplicated / bounded / logged. |

### Portal (staff)

| # | Finding | Fix |
|---|---------|-----|
| P1 | Sortable table headers rendered mixed-case (`<button>` loses `uppercase` via Tailwind preflight) on every overview. | Fixed in `components/ui/table.tsx`. |
| P2 | ~65 inline `toLocaleDateString/…` call sites → mixed formats on one screen. | Routed through `@/lib/format`. |
| P3 | `vitest` red on `dev`: schema-test fixture missed PRD-16 `travelTrackingEnabled`. | Fixture updated. |
| P4 | Main JS chunk ~921 KB before the login page: tiptap/prosemirror via the UI barrel, konva + docx-preview force-preloaded by object-form `manualChunks`. | Barrel no longer exports the rich-text editor; lazy chunks; see §3 for numbers. |
| P5 | Shared `Modal` had no focus management (Tab escaped behind the overlay; nested modals shared one heading id). | Initial focus, Tab trap, focus restore, `useId()`. |
| P6 | `/planning`, `/favorites`, `/search` swallowed load errors. | `ErrorBox`. |
| P7 | Inspector detail page off-pattern, no not-found state. | `DetailPageLayout` + audit sidebar + states. |
| P8 | Hand-rolled headers on planning/org-settings/profile/activity/search; `<h1>` vs `<h2>` drift. | `PageHeader`. |
| P9 | Hard-coded `bg-blue-600` selection colours broke org branding. | `primary-*` tokens. |
| P10 | Uren (PRD-16) polish: double padding, raw date inputs/textarea, inline query keys. | Aligned with shared components / key factory. |
| P11 | `apiClient.get` in `useEffect` with race + swallowed errors (link-entities modal). | `useQuery` + debounce. |
| P12 | Local delete-confirm modals, local error boxes, duplicated role-label maps, missing `aria-label`s, non-responsive header, English label. | Shared primitives / labels. |
| P13 | Base domain hard-coded (`*.inspexi.nl`) in both SPAs → any other staging domain lands in the superuser realm. | `VITE_BASE_DOMAIN` (falls back to the old heuristic). |

### Client portal

Signature canvas pointer scaling on phones + `onClear`, keyboard-operable photo
uploader, message-tab error handling, awaited logout, `aria-*`/`htmlFor` fixes,
local-date "tomorrow", `<dl>` semantics, tracked `vite.config.d.ts` removed.

---

## 2. Still open — needs a decision or infra work

| # | Item | Why it matters | Owner |
|---|------|----------------|-------|
| O1 | **CI is not on `dev`** — `.github/workflows/ci.yml` lives on `ci/github-workflows` (3 commits). | No build/test gate on PRs to dev. | Merge that PR first. |
| O2 | **No deploy artifact for the SPAs, no reverse proxy, no staging compose.** | Only the API and convert-api have Dockerfiles; `VITE_*` are build-time. | Decide hosting (Docker host vs PaaS) → add `apps/portal/Dockerfile`, `apps/client-portal/Dockerfile` (nginx, SPA fallback, `/api` proxied with `Host` + `X-Forwarded-*` preserved) and `docker-compose.staging.yml`. |
| O3 | **Client-portal host scheme (DEP-11).** Nested subdomains are `unknown` to the middleware; the refresh cookie is `domain=.BASE_DOMAIN`. | Pick `<slug>.<BASE_DOMAIN>` for staff and a single-level label or path for the client portal; set `VITE_BASE_DOMAIN`, `CLIENT_PUBLIC_URL`. | Product decision. |
| O4 | Migrations have no in-image path (Prisma CLI excluded from the runtime image; runbook assumes a checkout). | PaaS release commands need one. | Add a `migrate` stage or keep `prisma` in the image. |
| O5 | convert-api image: `npm install` without lockfile, copies a host-built `dist`, runs as root. | Non-reproducible. | Build in-image with pnpm, `USER node`. |
| O6 | Uploads default to a container path with `STORAGE_DRIVER=local`. | Lost on redeploy. | Volume or `STORAGE_DRIVER=r2`. |
| O7 | Node 20 is EOL (April 2026) in `.nvmrc`, Dockerfiles, CI, `engines`. | Security updates. | Bump to 22 in one PR after CI is green. |
| O8 | Refresh-token rotation has no reuse detection; concurrent refreshes from two tabs log one out. | Occasional forced logout. | Grace window / token family. |
| O9 | No e2e suite for PRD-16 time-tracking (start/stop 409, timesheet state machine, pings, CSV, sync push). | Newest domain untested end-to-end. | `test/time-tracking.e2e-spec.ts`. |
| O10 | AI conversation history sent unbounded to the model; `listConversations` unbounded. | Long chats eventually fail. | Cap / window messages. |
| O11 | Client-portal message attachments link to a raw DB value; no authenticated download route. | Broken link for customers. | Add `client/messages/:id/attachments/:attId`. |
| O12 | Google Fonts loaded from `fonts.googleapis.com` in the portal (signature fonts). | External dependency / CSP. | Self-host. |
| O13 | Staging Postgres role must be able to `CREATE EXTENSION ltree, pg_trgm`. | Migrations fail otherwise. | Check with the provider. |

---

## 3. Verification

Filled in at the end of the branch:

- `npx turbo run build` — all packages
- API unit (`jest`), API e2e (serial, seeded DB), portal + client-portal `vitest`
- Bundle: main chunk before/after (see `bundle-before.txt` / `bundle-after.txt` in the PR)
- Browser smoke on `inspexidemo.localhost:5173` / `:5174` with before/after screenshots per visible change (attached to the PR)
