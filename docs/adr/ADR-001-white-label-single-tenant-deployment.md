# ADR-001 — White-label single-tenant deployment

- **Status:** Accepted (strategy / not yet implemented)
- **Date:** 2026-06-14
- **Deciders:** InspeXi engineering
- **Related:** `docs/multi-tenant-hardening-plan.md`, ADR-002 (DB-per-tenant via connection routing)

## Context

InspeXi Beheer is built as a **pooled multi-tenant** SaaS: one application, one shared
PostgreSQL database, every `imp_`-prefixed table carries an `orgId`, and tenant isolation is
enforced in three layers:

1. `TenantMiddleware` — resolves the tenant from the request hostname
   (`{slug}.{BASE_DOMAIN}`), caches the `Organization` (`TenantCacheService`, 5 min), and
   attaches a `TenantContext` to the request.
2. `TenantGuard` — asserts `user.orgId === tenant.orgId`.
3. Service layer — every query is org-scoped via `orgScope(user)` plus
   `assertSameOrg()` / `assertAllSameOrg()` on foreign keys.

For most customers this pooled model is exactly what we want. For a subset of customers we
want to offer a **white-label deployment**: their own domain, their own isolated environment,
and their own database — for branding, data-residency, procurement, or contractual reasons.

The question this ADR answers is: **do we need to build single-tenant support now, or can we
convert later — and how?**

## Decision

**We do not build single-tenant white-label now.** We keep the pooled multi-tenant model as
the single code path and treat a white-label customer as **the same codebase, deployed as an
isolated instance with exactly one organization in its own database.** The custom domain points
at that instance.

This is the standard SaaS **"pool, then silo"** evolution. Because we are isolated by `orgId`
from day one, "silo" is a **deployment-topology change, not a rewrite**: a single-tenant
instance is just a pooled instance where `n = 1`.

We accept the small, low-regret discipline costs listed below now, and defer the actual
single-tenant build until the first white-label customer is contracted.

### Why the current architecture already supports this

| Concern | Already in place | Consequence for single-tenant |
|---|---|---|
| Data isolation | Every query org-scoped via `orgScope()` | One org per DB "just works"; no query changes |
| Tenant resolution | Single choke point in `TenantMiddleware` → `TenantContext` | Only one place needs a new resolution mode |
| Storage | Keyed `{orgId}/{uuid}-{filename}` via `StorageProvider` | Per-customer data export/move is trivial |
| Config | Env-driven (`BASE_DOMAIN`, `DATABASE_URL`, cookie domain, CORS) | A new instance is a new env file + DB |
| Branding | Lives in the `Organization` record (logo, theme colours) | White-label is **data**, not code |
| Per-org numbering | `@@unique([orgId, quoteNumber])` etc. | No global-sequence collisions |

## How we will do it (when the time comes)

The recommended path is **one full deployment per white-label customer** (separate app
instance + separate database), provisioned from the same Docker image.

### 1. Provisioning

- Spin up a new app instance (container) and a dedicated PostgreSQL database.
- Run the migration chain against the empty DB (`prisma migrate deploy`).
- Seed exactly one `Organization` with the customer's branding, plus their initial admin user.

### 2. Tenant resolution — add a "single" mode

Add two env vars and one branch to the existing resolver. No service code changes.

```env
TENANT_MODE=single            # 'pool' (default) | 'single'
SINGLE_TENANT_ORG_SLUG=klantx # which org this instance serves
```

In `TenantMiddleware`, short-circuit when in single mode: always resolve the configured org
regardless of hostname, so the customer's own domain (`portaal.klant.nl`) needs no subdomain
structure at all.

```typescript
// pseudo — inside TenantMiddleware.use()
if (this.tenantMode === 'single') {
  const org = await this.findOrgBySlug(this.singleTenantSlug);
  if (!org || !org.isActive) { /* 404 */ }
  req.tenant = { slug: org.slug, organization: org, orgId: org.id, isSuperuserDomain: false };
  return next();
}
// else: existing hostname classification (pool mode)
```

`TenantGuard` and `orgScope()` keep working unchanged — there is still exactly one `orgId`.

### 3. Domains, cookies, CORS

- `BASE_DOMAIN` becomes the customer's own domain.
- Cookie-domain logic already derives from `BASE_DOMAIN` (dev = no domain, prod = shared
  parent); in single-tenant the cookie is simply scoped to the customer domain.
- The dynamic CORS origin function already allows `BASE_DOMAIN` and its subdomains — it follows
  automatically.
- `trust proxy` already flips on when `BASE_DOMAIN !== 'localhost'`.

### 4. Hide cross-org / superuser surface

In single mode, feature-flag off everything that assumes a shared DB with many orgs:

- the `mijn.` superuser domain and the org switcher,
- any cross-org reporting/analytics,
- org creation/offboarding flows.

These become no-ops or hidden; they are not on the critical path for a single tenant.

### 5. Release & operations

- Same Docker image for every customer; per-customer **env file + database**.
- CI deploys to N targets (one pipeline parameterised per customer, or a small config registry).
- Backups, migrations and monitoring run per instance. Migrations roll out per customer instead
  of once globally — schedule accordingly.

## Low-regret things to keep doing now

These cost nothing extra but keep the future conversion a config change rather than a refactor:

1. **Resolve the tenant only in the tenant layer.** Never read `req.hostname` / the subdomain
   in services — always go through `TenantContext`. This is the single most important rule; as
   long as it holds, switching resolution modes is trivial.
2. **No hardcoded `inspexi.nl` or subdomain assumptions** outside config. Everything off
   `BASE_DOMAIN` / env.
3. **Keep the migration chain cleanly replayable on an empty database.** Provisioning a fresh
   single-tenant DB replays the whole chain — it must not depend on `prisma db push` drift
   (see the June 2026 repair migration; do not reintroduce drift).
4. **Keep `orgScope` discipline absolute**, and keep cross-org/analytics features **optional and
   superuser-only** so they never become a core dependency that breaks on an isolated DB.
5. **Keep branding fully in the `Organization` record.** Anything customer-specific that lives in
   code instead of data is future white-label debt.
6. **Keep storage keyed by `orgId`.** Makes per-customer export/import for onboarding or
   offboarding a one-prefix operation.

## Things to avoid (they make the conversion hard)

- Reading hostname/subdomain in scattered places instead of the middleware.
- Global (non-per-org) sequences or unique constraints — already avoided
  (`@@unique([orgId, …])`); keep it that way.
- Core flows that assume "all orgs live in one DB" or "superuser sees everything."

## Alternatives considered

- **Build multi-deployment single-tenant now.** Rejected: no contracted customer yet; the
  architecture already makes later conversion cheap, so building now is premature investment.
- **Shared cluster, one database per premium tenant, selected by per-request connection
  routing.** A real middle ground — more powerful (one deployment, many isolated DBs) but
  materially more complex (per-request datasource switching, a `PrismaClient` per tenant, audit
  middleware per client, migrations fanned out across DBs). Documented separately in **ADR-002**
  and **deferred**. For white-label on a customer's own domain, a full separate deployment is
  simpler, safer and easier to explain — we start there.

## Consequences

**Positive**

- No work required now; the pooled model stays the only code path.
- Conversion later is mostly DevOps/config plus one middleware branch.
- Strong isolation for white-label customers (separate DB + instance) with no shared-tenant
  blast radius.

**Negative / costs**

- Operational multiplication: each white-label customer is a separate instance to deploy,
  migrate, back up and monitor. Fine at small N; revisit ADR-002 if N grows large.
- Cross-customer analytics/superuser views do not span white-label instances by design.
- A little ongoing discipline (the rules above) to keep the door open.
