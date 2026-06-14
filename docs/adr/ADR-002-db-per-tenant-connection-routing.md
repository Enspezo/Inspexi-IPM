# ADR-002 — DB-per-tenant via per-request connection routing

- **Status:** Explored / **Deferred** (documented, not chosen for now)
- **Date:** 2026-06-14
- **Deciders:** InspeXi engineering
- **Related:** ADR-001 (white-label single-tenant deployment) — this is the "middle ground"
  alternative referenced there.

## Context

ADR-001 chose **one full deployment per white-label customer** (separate app instance +
separate database). This ADR works out the alternative middle ground in detail so the trade-off
is on record for when the number of isolated customers grows.

The middle ground is the **"bridge" / pool-with-isolated-storage** pattern:

> **One shared application cluster**, but **a separate database per (premium) tenant**, with the
> correct database chosen **per request** based on the resolved tenant.

It sits between the two ends of the spectrum:

| Model | App | Database | Today |
|---|---|---|---|
| Pooled (current) | shared | shared, `orgId` per row | ✅ in production |
| **DB-per-tenant routing (this ADR)** | **shared** | **one DB per tenant** | explored / deferred |
| Full single-tenant (ADR-001) | one instance per customer | one DB per customer | recommended for white-label |

The attraction: customer-level **physical data isolation** without multiplying deployments —
one app cluster keeps serving everyone, premium tenants just get their own database.

## How it would work

### 1. Tenant → datasource resolution

We already resolve the tenant once per request in `TenantMiddleware` and expose it via
`TenantContext` (and `requestContext`, an `AsyncLocalStorage` store). That same resolution step
becomes the place to decide **which database** the request uses.

A `tenant → connection string` map (from a control-plane table in a small shared "router" DB, or
from config/secrets) is consulted:

- Tenants with a dedicated DB → their own connection string.
- Everyone else → the shared pooled DB (we can keep both models at once).

The resolved datasource URL is stashed in `requestContext` alongside `orgId`.

### 2. A `PrismaClient` per database

This is the core change, and the main source of complexity. Today `PrismaService extends
PrismaClient` is a **single global client** (one connection pool, `$use` audit middleware
attached once in `onModuleInit`). Per-tenant databases require **one `PrismaClient` instance per
datasource URL**, created lazily and cached:

```typescript
// pseudo — a registry that hands out a client per database
@Injectable()
export class PrismaClientRegistry implements OnModuleDestroy {
  private readonly clients = new Map<string, PrismaClient>(); // key: datasource URL

  get(datasourceUrl: string): PrismaClient {
    let client = this.clients.get(datasourceUrl);
    if (!client) {
      client = new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
      this.attachAuditMiddleware(client); // the $use logic, per client
      this.clients.set(datasourceUrl, client);
    }
    return client;
  }

  async onModuleDestroy() {
    await Promise.all([...this.clients.values()].map((c) => c.$disconnect()));
  }
}
```

Every service that currently injects `PrismaService` would instead obtain the **request-scoped
client** for the active tenant — e.g. a request-scoped provider that reads the datasource URL
from `requestContext` and returns `registry.get(url)`. This is a broad change because nearly
every service touches Prisma.

### 3. Connection-pool budget

Each `PrismaClient` opens its own pool. With `T` tenant databases and `P` app instances you have
up to `T × P × pool_size` connections against Postgres (or a shared PgBouncer). This must be
budgeted and capped:

- small per-client pool sizes,
- an LRU eviction policy on the client registry (disconnect idle tenants),
- and/or an external pooler (PgBouncer) in front.

### 4. Migrations fan out

`prisma migrate deploy` must run against **every** tenant database, transactionally per DB, with
tracking of which DB is on which migration. A failed migration on tenant 37 must not leave the
fleet half-migrated. This needs an orchestrated rollout job and per-DB version tracking.

### 5. Cross-cutting concerns that change

- **Audit middleware** (`$use`) must be attached to every client (handled in the registry above).
- **`requestContext`** gains a `datasourceUrl` field; the audit writer uses the same client.
- **Health checks / readiness** must consider per-tenant DB reachability, not one DB.
- **Control plane**: a shared table mapping tenant → DB → status (active, migrating, suspended)
  becomes a new source of truth to build and protect.
- **Backups & PITR** are per tenant DB (a benefit, but more objects to manage).

## When this model is the right call

- The number of isolated customers is **too large to run as separate full deployments**
  (dozens+), so collapsing them onto one app cluster saves real operational cost.
- Customers need **physical DB isolation** (residency, contractual) but **not** their own
  application instance, custom domain stack, or independent release cadence.
- You want to keep pooled and isolated tenants **side by side** behind one app.

## When it is the wrong call (why we defer)

- For **white-label on the customer's own domain**, ADR-001's separate deployment is simpler,
  gives independent branding/release/scaling, and is far easier to reason about and explain to a
  customer.
- At small N, the per-request routing machinery (client registry, pool budgeting, migration
  orchestration, control plane) is **disproportionate complexity** for the benefit.
- It touches the **hottest path in the codebase** (every Prisma call) and the audit subsystem —
  high blast radius for a capability no contracted customer needs yet.

## Decision

**Deferred.** We do not implement per-request DB routing now. We keep the pooled model
(current) and reach for ADR-001 (separate deployment) for the first white-label customers.

We revisit this ADR if/when the count of physically-isolated tenants grows large enough that
running them as independent deployments becomes the dominant operational cost.

## Migration note (if we ever adopt it)

Because data is already `orgId`-scoped, moving a tenant from the pooled DB onto its own database
is a **filtered export/import** (all rows where `orgId = X`, plus their storage objects under the
`{orgId}/…` prefix), followed by flipping that tenant's entry in the control-plane map. No schema
change to the application is required — only the routing layer and the per-client plumbing above.

## Consequences

**Positive**

- Physical per-tenant isolation without multiplying app deployments.
- Pooled and isolated tenants coexist behind one cluster.
- Per-tenant backup/restore and blast-radius containment.

**Negative**

- A `PrismaClient` per tenant: connection-pool pressure, lifecycle management, audit middleware
  per client.
- Migrations and health checks fan out across many databases with orchestration and tracking.
- A new control plane (tenant → DB map) to build, secure and operate.
- Broad, high-risk change to the request/data path for a need that is not yet contracted.
