# Test Environment Readiness Checklist

Practical, code-verified guide for standing up the **first shared TEST environment** for InspeXi Beheer
on a real (non-`localhost`) domain such as `*.test.inspexi.nl`.

Scope of this document: the NestJS API (`apps/api`), the two Vite SPAs
(`apps/portal` = staff, `apps/client-portal` = external clients) and the DOCX→PDF
microservice (`apps/convert-api`). Every requirement below is traced to the actual code;
file paths are cited. Items that the code does **not** provide yet are written as
explicit `TODO` referencing a finding number `[DEP-n]` from the accompanying review report.

> Terminology: `BASE_DOMAIN` = the apex the platform runs on (e.g. `test.inspexi.nl`).
> Each tenant/org lives on a **single-level subdomain** `<slug>.<BASE_DOMAIN>`
> (e.g. `inspexidemo.test.inspexi.nl`). SUPERUSER lives on `mijn.<BASE_DOMAIN>` and on the apex.

---

## 1. Prerequisites & infrastructure

| Component | Requirement | Source of truth |
|---|---|---|
| Node.js | **20.x** (`.nvmrc` = `20`, `engines.node >= 20`) | `/.nvmrc`, `/package.json` |
| pnpm | **>= 10** (repo pins `pnpm@10.7.0`) | `/package.json` `packageManager` |
| PostgreSQL | **15** with permission to `CREATE EXTENSION` for `pg_trgm` **and** `ltree` (both created inside migrations) | `apps/api/prisma/schema.prisma` (`extensions = [pg_trgm]`, `previewFeatures=["postgresqlExtensions"]`); migrations `20260623214008_help_trigram_search`, `20260629093657_unified_asset_node_tree` |
| LibreOffice | `soffice` (writer+calc) on the **convert-api** host — used by `libreoffice-convert` | `apps/convert-api/Dockerfile`, `CONVERT-API.md` |
| Chromium | Present on the **API** host for Puppeteer PDF generation (bundled download **or** system binary via `PUPPETEER_EXECUTABLE_PATH`); launched with `--no-sandbox` | `apps/api/src/modules/document-generation/pdf-generation.service.ts:70-76` |
| TLS | **HTTPS end-to-end is mandatory** — auth/refresh cookies are `Secure` whenever `BASE_DOMAIN != localhost` (both realms). Plain HTTP breaks login persistence. | `apps/api/src/modules/auth/auth.controller.ts:47`, `apps/api/src/modules/client-auth/client-auth.controller.ts:50` |
| Reverse proxy | Wildcard `*.BASE_DOMAIN` TLS + Host-preserving proxy; exactly **one** proxy hop (see §5 and `[DEP-14]`) | `apps/api/src/main.ts:80` |
| Persistent disk | For `UPLOAD_DIR` when `STORAGE_DRIVER=local` (uploaded documents/photos live on disk) | `apps/api/src/common/services/storage/local-storage.provider.ts` |
| RAM | convert-api needs >= 1 GB (LibreOffice is memory-heavy) | `CONVERT-API.md` |

`docker-compose.yml` only defines **postgres** and **convert-api** — there is **no** service
for the API or the two SPAs. It is a dev helper, not a deployment stack. The test env needs its
own process manager / orchestrator for the API + static hosting for both SPAs. See `[DEP-4]`.

---

## 2. Environment-variable matrix

### 2a. API — `apps/api/.env` (authoritative; compared against `apps/api/.env.example`)

| Name | Required | Example (test) | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | `postgresql://user:pass@db-host:5432/inspexi_test?schema=public` | Prisma datasource. |
| `NODE_ENV` | **yes (set `production`)** | `production` | Now in `.env.example` `[DEP-8]`. Drives security: JWT mutual-uniqueness is enforced only when `production` (`validate-jwt-secrets.ts:42`); throttler is skipped only when `test` (`app-throttler.guard.ts:12`); Swagger defaults off when `production`. Leave unset → weaker validation. |
| `JWT_SECRET` | **yes** | `openssl rand -hex 32` | Boot fails if missing or `change-me-in-production`. |
| `JWT_REFRESH_SECRET` | **yes** | (unique) | Must differ from the others in `production`. |
| `CLIENT_JWT_SECRET` | **yes** | (unique) | Client realm. |
| `CLIENT_JWT_REFRESH_SECRET` | **yes** | (unique) | Client realm. All four validated at boot (`main.ts:32` → `validate-jwt-secrets.ts`). |
| `JWT_ACCESS_EXPIRATION` | no | `15m` | Default `15m`. |
| `JWT_REFRESH_EXPIRATION` | no | `30d` | Default `30d`. |
| `JWT_REFRESH_SHORT_EXPIRATION` | no | `12h` | "Remember me" off. |
| `CLIENT_JWT_EXPIRATION` | no | `1h` | |
| `CLIENT_JWT_REFRESH_EXPIRATION` | no | `30d` | |
| `BASE_DOMAIN` | **yes** | `test.inspexi.nl` | Central to tenancy, CORS, cookie domain, trust proxy, `secure` cookies. |
| `PORTAL_PORT` | no | `443` | Only used to build CORS origins when localhost; irrelevant behind TLS proxy. |
| `SUPERUSER_SUBDOMAIN` | no | `mijn` | Default `mijn`. |
| `API_PORT` | no | `3000` | Port the API listens on. |
| `API_BASE_URL` | **recommended** | `https://api.test.inspexi.nl` or `https://test.inspexi.nl` | Now in `.env.example` `[DEP-7]`. Used to build notification-email unsubscribe links (`notifications.service.ts:103`). Defaults to `http://localhost:<API_PORT>` → broken links in test emails if unset. |
| `PUBLIC_URL` | **yes** | `https://test.inspexi.nl` | STAFF-facing links in emails: password-reset, invite, quote, planning, signing. Single static host, **no per-org subdomain** `[DEP-6]`. |
| `CLIENT_PUBLIC_URL` | recommended | `https://inspexidemo.test.inspexi.nl` (client host) | Now in `.env.example` `[DEP-5]`. Base URL for CLIENT-portal password-reset links; falls back to `PUBLIC_URL` if empty. Set it so client resets don't point at the staff portal. |
| `SWAGGER_ENABLED` | no | (leave empty) | `[DEP-9]`. Empty → Swagger on outside production, off in production. `true`/`false` to force. |
| `CLIENT_PORTAL_BASE_DOMAIN` | conditional | (leave empty if client-portal runs on `<slug>.BASE_DOMAIN`) | Only widens CORS for a **separate** client-portal base domain. Does **not** enable tenant resolution on a nested domain `[DEP-11]`. |
| `RESEND_API_KEY` | for email | `re_...` | Without it, all email silently fails (caught + logged). Magic-links/reset/invite won't arrive. |
| `RESEND_FROM_EMAIL` | for email | `noreply@test.inspexi.nl` | Default `noreply@inspexi.nl` (`email.service.ts:32`). Must be a Resend-verified sender. |
| `RESEND_WEBHOOK_SECRET` | no | `whsec_...` | Only needed if wiring Resend delivery/bounce webhooks (`webhooks.controller.ts:44`). |
| `SEED_DEMO` | no | `0` | See §4. `1` seeds passwordless demo magic-links + demo AI-review run. **Keep `0` on a shared URL.** |
| `UPLOAD_DIR` | if local storage | `/var/lib/inspexi/uploads` | Mount a persistent volume. |
| `STORAGE_DRIVER` | no | `local` or `r2` | `local` (default) or `r2` (`storage.module.ts`). |
| `R2_ACCOUNT_ID` | if `r2` | `` | `[DEP-2]` fixed: the R2 provider is now instantiated only when `STORAGE_DRIVER=r2`, so with `local` these may be empty or absent — the API boots either way. Required only for `r2`. |
| `R2_BUCKET_NAME` | if `r2` | `` | idem |
| `R2_ACCESS_KEY_ID` | if `r2` | `` | idem |
| `R2_SECRET_ACCESS_KEY` | if `r2` | `` | idem |
| `R2_PUBLIC_URL` | if `r2` | `` | Public base URL for R2 objects. |
| `PUPPETEER_EXECUTABLE_PATH` | conditional | `/usr/bin/chromium` | Empty → puppeteer's bundled Chromium. Set when using a system Chromium (containers). |
| `PDF_MAX_CONCURRENCY` | no | `2` | Now in `.env.example` `[DEP-15]`. Tunes concurrent PDF renders (`pdf-generation.service.ts:44`). Code default 3. |
| `CONVERT_API_URL` | for DOCX→PDF | `https://convert.test.inspexi.nl` | Main API → convert-api (`quotes/pdf.service.ts:20`). |
| `CONVERT_API_KEY` | for DOCX→PDF | `openssl rand -base64 32` | **Must match** convert-api. Defaults to placeholder `change-me-in-production` with no fail-fast `[DEP-13]`. |
| `ANTHROPIC_API_KEY` | for AI | `sk-ant-...` | Empty → voice-parsing **and** AI-review disabled (`GET /voice/status`, `GET /ai-review/status` → `available:false`). |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-6` | Voice parsing. |
| `ANTHROPIC_REVIEW_MODEL` | no | `claude-sonnet-4-6` | AI-review (PRD-13). |
| `KVK_API_KEY` | no | (public test key shipped) | KvK Handelsregister. |
| `KVK_USE_TEST_ENV` | no | `true` | Keep `true` in test to use the KvK test API. |
| `PDOK_LOCATIESERVER_URL` | no | (default works keyless) | Address geocoding. |
| `PDOK_BAG_OGC_URL` | no | (default works keyless) | BAG building data. |
| `TOMBSTONE_CLEANUP_ENABLED` | no | `true` | Daily 03:00 tombstone cleanup; `0`/`false` disables. |
| `MEETMIDDEL_KALIBRATIE_DREMPEL_DAGEN` | no | `30` | Now in `.env.example` `[DEP-15]`. Calibration-warning threshold (`measurement-instruments.*`). Code default. |

### 2b. convert-api — `apps/convert-api/.env`

| Name | Required | Example | Notes |
|---|---|---|---|
| `CONVERT_API_PORT` | no | `3002` | `main.ts` default 3002. |
| `CONVERT_API_KEY` | **yes** | (same as main API) | Guard rejects missing/mismatched key with 401 (`convert/guards/api-key.guard.ts:16-23`). |
| `CONVERT_TIMEOUT_MS` | no | `60000` | LibreOffice timeout. |

### 2c. Staff portal — `apps/portal` (build-time `VITE_*`; `.env.example` added `[DEP-16]`)

| Name | Required | Example | Notes |
|---|---|---|---|
| `VITE_CLIENT_PORTAL_BASE` | recommended | `https://{slug}.test.inspexi.nl` | Deep-links from staff → client portal; `{slug}` is replaced by the current subdomain (`lib/client-portal.ts`). Dev fallback: `hostname:5174`. |
| `VITE_PDOK_LUCHTFOTO_WMS_URL` | no | (default) | Aerial-photo WMS base (`lib/pdok.ts`). |
| `API_PROXY_TARGET` | dev only | — | Vite dev proxy target (default `http://localhost:3001`). Not used in a built/static deploy. |

Staff API base URL is the **relative** `/api/v1` (`lib/api-client.ts:11`) → same-origin; the reverse
proxy must route `/api` on every org subdomain to the API (see §5).

### 2d. Client portal — `apps/client-portal/.env`

| Name | Required | Example | Notes |
|---|---|---|---|
| `VITE_API_URL` | no (leave empty) | `` | `lib/api-client.ts:14` defaults to relative `/api/v1`. Leave empty so the org subdomain (Host) drives tenant resolution. An absolute cross-domain URL breaks subdomain tenancy. |

---

## 3. Build steps

Build from the **repo root** so Turbo compiles the four workspace packages
(`packages/{entitlements,calibration,shared-web,ui}`) before the apps (`build` `dependsOn: ["^build"]`).

```bash
pnpm install --frozen-lockfile      # pnpm 10; onlyBuiltDependencies (bcrypt/prisma/esbuild) are pre-approved in root package.json
pnpm --filter api exec prisma generate
pnpm build                          # turbo build → api dist/, portal dist/, client-portal dist/, convert-api dist/
```

- API: `nest build` → `apps/api/dist`, run with `node dist/main` (`start:prod`).
- convert-api: `nest build` → `apps/convert-api/dist`, run with `node dist/main`.
- Staff/client portal: `tsc -b && vite build` → `apps/{portal,client-portal}/dist` (static assets).
- **Seeding needs dev dependencies**: `prisma:seed` runs `ts-node prisma/seed.ts` (`ts-node` is a
  devDependency). A production-only install (`--prod`) cannot seed — run the seed from a full install,
  or compile/seed separately.

---

## 4. Database steps (fresh DB)

The DB user must be able to create the `pg_trgm` and `ltree` extensions (the migrations do
`CREATE EXTENSION IF NOT EXISTS ...`), or pre-create them as a superuser.

**Use `migrate deploy`, never `migrate dev` / `db push` on a shared DB** `[DEP-1]`.
`pnpm db:migrate` maps to `prisma migrate dev` (interactive, can create/reset migrations) — do **not**
use it against the test DB. Use the dedicated deploy script (added on this branch), or run Prisma directly:

```bash
pnpm db:migrate:deploy              # = pnpm --filter api prisma:migrate:deploy (prisma migrate deploy)
# or explicitly:
cd apps/api
DATABASE_URL=... npx prisma migrate deploy   # applies the full migration chain in order
DATABASE_URL=... npx prisma generate
```

Verified: the full chain replays cleanly on an empty database (`migrate deploy` from scratch), producing
the ltree + pg_trgm extensions, both AssetNode path triggers, the `imp_asset_nodes_path_gist` GiST index
and the `imp_ai_review_runs_pending_plan_key` partial-unique index.

`migrate deploy` also creates the two hand-maintained objects that live only in migration SQL:
the ltree materialized-path **triggers** + **GiST** index (`imp_asset_nodes_path_gist`) and the
**partial unique** index `imp_ai_review_runs_pending_plan_key`. No manual step needed for a fresh DB.

### Seed decision — `SEED_DEMO` trade-off

`pnpm db:seed` (`prisma/seed.ts`) performs a **FULL WIPE** of the DB (starts with `deleteMany` on every
model, `seed.ts:515+`) and reseeds users, orgs and demo data. All seeded passwords are the well-known
`Password123!` (`seed.ts:847`), including the only SUPERUSER (`superuser@inspexi.nl`).

- `SEED_DEMO=0` (default): standard seed. No passwordless magic-links, no demo AI-review run.
- `SEED_DEMO=1`: additionally creates **passwordless** client-portal magic-links (direct login without
  a password, e.g. `/magic/demo-klant-magic`, 30-day expiry) and a COMPLETED demo AI-review run.

**Recommendation for a shared test URL: seed with `SEED_DEMO=0`**, then immediately rotate the seeded
passwords (see §9). `SEED_DEMO=1` puts a password-less door on a publicly reachable URL — only use it on
an access-restricted/VPN'd test host.

**Superuser bootstrap without the full wipe**: there is currently **no** standalone create-superuser
script `[DEP` note in §10]. On an empty DB the only supported way to get a SUPERUSER is the full
`seed.ts` (which wipes) or a manual insert via Prisma Studio / SQL (bcrypt-hash a password). Plan for
one of these before first login.

If the tenant cache serves a stale org after reseeding, restart the API (5-min in-memory TTL).

---

## 5. Runtime & reverse-proxy configuration

**Host preservation is mandatory.** Tenant resolution reads `req.hostname` (`tenant.middleware.ts:33`).
`main.ts:80` sets `trust proxy = 1` when `BASE_DOMAIN != localhost`, so Express derives `req.hostname`
from `X-Forwarded-Host` and `req.ip` from `X-Forwarded-For` — **from exactly one proxy hop**.

Fail-secure behaviour (`tenant.guard.ts:57-63`): outside localhost, an authenticated request that does
**not** arrive on a known org subdomain gets `403 "Gebruik het subdomein van uw organisatie"`. So the
proxy must forward the real org host.

Required routing (per org subdomain `<slug>.BASE_DOMAIN` and `mijn.BASE_DOMAIN`):

- `/api/*`  → API service (`API_PORT`), set `X-Forwarded-Host $host`, `X-Forwarded-For`,
  `X-Forwarded-Proto $scheme`. Preserve Host.
- everything else → the **staff** SPA static bundle (`apps/portal/dist`), SPA fallback to `index.html`.
- **Body size**: allow at least **10 MB** on `/api/v1/sync`, `/api/v1/generated-documents`,
  `/api/v1/signature-requests`, `/api/v1/client/documents` (the API raises these to 10 MB in
  `main.ts:59-68`; the rest is capped at 1 MB). Set nginx `client_max_body_size 10M` on those paths.
- convert-api (`convert.BASE_DOMAIN`): `client_max_body_size 50M`, `proxy_read_timeout 120s`
  (see `CONVERT-API.md` for a ready nginx block).

**Client portal co-hosting decision** `[DEP-11]`: client endpoints resolve the org from the subdomain
(`@CurrentTenant('orgId')`, `client-*.controller.ts`), and the tenant middleware classifies any
**nested** subdomain (`<slug>.klant.BASE_DOMAIN`) as `unknown` → `orgId=null` → client APIs fail.
Therefore the client SPA must be reachable at a **single-level** `<slug>.BASE_DOMAIN` host. Since the
staff SPA already owns that host root, decide one of:
  1. Serve the client SPA under a **path** on the same org subdomain (e.g. `<slug>.BASE_DOMAIN/portaal`)
     and route non-`/api`, non-`/portaal` to staff. (Requires the client SPA `base` to match the path.)
  2. Give the client portal its own single-level label pattern that still ends in `.BASE_DOMAIN`.
  Setting `CLIENT_PORTAL_BASE_DOMAIN` alone is **not** sufficient — it only affects CORS, not tenancy.

**WebSockets**: none. Chat/presence uses the HTTP `/sync` contract (no Socket.IO/WS gateway in the API),
so no WS upgrade rules are required.

---

## 6. External services

- **Anthropic** (voice + AI-review): set `ANTHROPIC_API_KEY`; optionally `ANTHROPIC_MODEL` /
  `ANTHROPIC_REVIEW_MODEL`. Missing key degrades gracefully (features report `available:false`,
  `anthropic-client.service.ts:28-33`). The key is never logged.
- **Resend** (email): `RESEND_API_KEY` + a verified `RESEND_FROM_EMAIL`. Optional
  `RESEND_WEBHOOK_SECRET` for delivery webhooks. All sends are fire-and-forget; failures are logged, not
  fatal — but reset/invite/magic-link emails simply won't arrive without a working key.
- **Storage**: `STORAGE_DRIVER=local` → persistent `UPLOAD_DIR` volume; `STORAGE_DRIVER=r2` → all four
  `R2_*` credentials + `R2_PUBLIC_URL`. **Either way keep the `R2_*` keys present in the env** `[DEP-2]`.
- **convert-api**: deploy the container (`apps/convert-api/Dockerfile`, node:20-slim + LibreOffice) or a
  systemd unit; share `CONVERT_API_KEY` with the API and point `CONVERT_API_URL` at it.
- **KvK / PDOK**: work with shipped defaults; keep `KVK_USE_TEST_ENV=true` in test.

---

## 7. Operability

- **Health checks**:
  - convert-api: `GET /convert/health` (unauthenticated) exists and is used by its Docker `HEALTHCHECK`.
  - API: `@Public() GET /api/v1/health` (added on this branch, `[DEP-3]` fixed) returns
    `{status:'ok',database:'up'}` after a light `SELECT 1`, or `{status:'degraded',database:'down'}` if the
    DB is unreachable. Point the load balancer at it (no auth, no subdomain required).
- **Graceful shutdown**: `app.enableShutdownHooks()` is now called in `main.ts` (`[DEP-10]` fixed), so
  `OnModuleDestroy` hooks (Prisma disconnect, Puppeteer browser close) run on SIGTERM/SIGINT. Still allow a
  short drain delay in the orchestrator.
- **Process/restart policy**: run the API and convert-api under a supervisor with restart-on-failure
  (systemd `Restart=on-failure`, pm2, or container `restart: unless-stopped`). `uncaughtException` calls
  `process.exit(1)` (`main.ts:24-27`), so the supervisor must restart it.
- **Scheduled jobs run in-process** (`@nestjs/schedule`): tombstone cleanup (daily 03:00), support-access
  expiry, quote scheduler, project-phases scheduler, measurement-instruments scheduler. If you ever run
  **more than one** API replica, these will double-fire — start with a single API instance for test, or
  add leader election.
- **Logging**: access log emits one line per response `>= 400` with method, path (query string stripped),
  status, duration, `requestId`, `userId`, `orgId` — **no body/headers/tokens** (`access-log.middleware.ts`).
  Secrets are not logged (Anthropic/Resend keys never printed). Log level is default Nest logger.
- **Rate limiting behind proxy**: global 120 req/min per IP; auth/public routes tighter. Correct per-IP
  attribution depends on `trust proxy = 1` and a **single** proxy hop `[DEP-14]`. Behind 2+ hops
  (CDN + nginx) `req.ip` becomes an intermediate address → the throttler and the org-enumeration guard
  (`tenant.middleware.ts:52-67`) mis-attribute all clients to one IP. Ensure one hop or adjust trust proxy.

---

## 8. Post-deploy functional smoke checklist

1. **API up**: `curl -k https://<slug>.test.inspexi.nl/api/v1/organizations/by-slug/<slug>` returns org
   branding (public route). A bad slug returns 404 from the tenant middleware.
2. **Staff login**: open `https://<slug>.test.inspexi.nl`, log in as an org admin. Confirm the
   `refresh_token` cookie is set with `Secure`, `Domain=.test.inspexi.nl`, `Path=/api/v1/auth`.
3. **SUPERUSER**: log in on `https://mijn.test.inspexi.nl`; confirm org switching.
4. **Tenant isolation**: an org user hitting a different org subdomain → 403.
5. **Inspection detail**: open an inspection plan; Assets/Findings/Plattegrond/Documenten tabs load.
6. **Document generation**: generate a PDF (exercises Puppeteer/Chromium) and a Word→PDF (exercises
   convert-api). Confirm both download.
7. **Client portal**: reach the client SPA on the chosen host (§5), perform a magic-link login, view an
   inspection, sign a document.
8. **AI review status**: `GET /api/v1/ai-review/status` → `available:true` if `ANTHROPIC_API_KEY` set
   (else `false`, which is a valid "AI off" state).
9. **Email path**: trigger a password-reset and confirm the mail arrives and the link host matches
   `PUBLIC_URL` (note `[DEP-5]`/`[DEP-6]` for client-portal and subdomain caveats).
10. **Uploads persist** across an API restart (volume check for `local` storage).

---

## 9. Security notes for a shared test URL

- **Seed passwords**: every seeded user (incl. `superuser@inspexi.nl`) uses `Password123!`
  (`seed.ts:847`). On any internet-reachable test URL, **rotate these immediately** after seeding, or
  seed a custom set. Do not leave the default SUPERUSER password live.
- **`SEED_DEMO=1` = password-less doors**: it seeds direct-login magic-links. Keep `SEED_DEMO=0` unless
  the host is access-restricted (VPN/basic-auth/IP allowlist).
- **Swagger** `[DEP-9]` (fixed): `GET /api/docs` is now gated by `SWAGGER_ENABLED` — off by default when
  `NODE_ENV=production`, on otherwise. Leave `SWAGGER_ENABLED` unset in the test env (with
  `NODE_ENV=production`) to keep the surface private, or set `SWAGGER_ENABLED=true` to expose it deliberately.
- **JWT secrets**: generate four **unique** strong secrets; the app refuses to boot on missing/placeholder
  values, and (with `NODE_ENV=production`) on duplicates.
- **`CONVERT_API_KEY`**: generate a real shared secret; the default placeholder is not rejected `[DEP-13]`.
- **HTTPS only**: cookies are `Secure` + `SameSite=lax` with `Domain=.BASE_DOMAIN`; serve strictly over TLS.

---

## 10. Known gaps / decisions needed (traces to review findings)

Most `[DEP-n]` items were **fixed in code** on branch `chore/test-env-readiness`
(see `docs/REVIEW-TEST-READINESS-2026-07.md`). The table below records the current
status; "Fixed" means the code/config change has landed and only the deploy-time
value/action remains.

| Ref | Gap | Status | Action for test env |
|---|---|---|---|
| `[DEP-1]` | No `migrate deploy` npm script | **Fixed** | `pnpm db:migrate:deploy` (or `--filter api prisma:migrate:deploy`) now exists; use it (§4). |
| `[DEP-2]` | `R2StorageProvider` `getOrThrow`s R2_* at boot even for `local` | **Fixed** | Provider is now instantiated lazily only when `STORAGE_DRIVER=r2`; `local` boots without R2_* keys. |
| `[DEP-3]` | No API health endpoint | **Fixed** | `@Public() GET /api/v1/health` added (light `SELECT 1`); point the LB at it. |
| `[DEP-4]` | No API Dockerfile; compose lacks API + SPAs; Chromium must be present | **Open (infra)** | Build an API image on `node:20-slim` + `chromium` (see below); or run under a supervisor with Chromium present. Deliberately not shipped — a pnpm-workspace + Prisma + Chromium image can't be validated in this repo's CI here. |
| `[DEP-5]` | Client-portal reset emails used staff `PUBLIC_URL` | **Fixed** | Client resets now use `CLIENT_PUBLIC_URL` (fallback `PUBLIC_URL`); set it to the client-portal host. |
| `[DEP-6]` | `PUBLIC_URL` has no per-org subdomain templating | **Open (decision)** | Pick a single host; token-based public pages resolve org from the token, so links work — but carry no slug. |
| `[DEP-7]` | `API_BASE_URL` missing from `.env.example` | **Fixed** | Documented; set it to the public API URL for working unsubscribe links. |
| `[DEP-8]` | `NODE_ENV` undocumented; drives JWT/throttle behaviour | **Fixed** | Documented; set `NODE_ENV=production`. |
| `[DEP-9]` | Swagger always exposed | **Fixed** | `/api/docs` now gated by `SWAGGER_ENABLED` (off in production by default). |
| `[DEP-10]` | No `enableShutdownHooks()` | **Fixed** | Added; Prisma/Puppeteer shut down cleanly on SIGTERM. |
| `[DEP-11]` | Client portal needs single-level org subdomain; `CLIENT_PORTAL_BASE_DOMAIN` is CORS-only | **Open (decision)** | Choose a co-hosting scheme (§5) before client-portal testing. |
| `[DEP-12]` | `CLIENT_PORTAL_PORT` stale in `.env.example` | **Fixed** | Removed from `.env.example`. |
| `[DEP-13]` | `CONVERT_API_KEY` placeholder not fail-fast | **Open (minor)** | Generate a real key; the guard still accepts the literal placeholder. |
| `[DEP-14]` | `trust proxy = 1` assumes exactly one hop | **Open (config)** | Ensure a single proxy hop for correct client-IP throttling. |
| `[DEP-15]` | `PDF_MAX_CONCURRENCY`, `MEETMIDDEL_KALIBRATIE_DREMPEL_DAGEN` missing from `.env.example` | **Fixed** | Documented; optional to tune. |
| `[DEP-16]` | No `apps/portal/.env.example` | **Fixed** | Added, documenting `VITE_CLIENT_PORTAL_BASE`, `VITE_PDOK_LUCHTFOTO_WMS_URL`. |

### API container image (`[DEP-4]` starting point — validate before use)

The API needs Node 20, Chromium for Puppeteer, the Prisma client, and the compiled
workspace packages. A robust image builds inside a multi-stage Dockerfile and uses
`pnpm deploy` (pnpm symlinks don't survive a raw `node_modules` copy). Minimum
requirements:

- Base with Chromium: `node:20-slim` + `apt-get install -y chromium fonts-liberation fonts-dejavu`,
  then set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` and skip Puppeteer's own download.
- Build stage: `pnpm install --frozen-lockfile`, `pnpm --filter api exec prisma generate`,
  `pnpm build`, then `pnpm --filter api deploy --prod /out` (bundles the workspace deps).
- Runtime: copy `/out` + `apps/api/prisma`, run `prisma migrate deploy` on start-up (or as an
  init job), then `node dist/main`.
- Seeding needs dev deps (`ts-node`) — run it from a full install, not the `--prod` image.
