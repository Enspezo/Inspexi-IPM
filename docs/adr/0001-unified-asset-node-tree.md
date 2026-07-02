# 0001 — Unified persistent `AssetNode` tree, scoped per CRM location

- **Status:** Proposed (design only — no code changed)
- **Date:** 2026-06-29
- **Deciders:** InspeXi engineering
- **Related:** `docs/INTEGRATIE-INSPEXI-APP.md` (§4 schema, §11 open punt 2/3), `apps/api/prisma/schema.prisma` (models `Asset`, `InspectionLocation`, `InspectionPlan`, `Location`)

## Context

Today the physical structure that an inspection walks over is modelled by **two parallel,
plan-scoped, self-referential tables**:

| Table | Tree via | Scope | Lifetime |
|---|---|---|---|
| `imp_assets` (`Asset`) | `parentAssetId` → `AssetHierarchy` | `inspectionPlanId` (FK, `onDelete: Cascade`) | dies with the plan |
| `imp_inspection_locations` (`InspectionLocation`) | `parentLocationId` | `inspectionPlanId` (FK, `onDelete: Cascade`) | dies with the plan |

Both carry an unused `treePath String?` placeholder, a denormalised `orgId`, and PWA-sync columns
(`syncedAt`, `deviceId`, `deletedAt`). Assets additionally point *across* the two trees via
`Asset.locationId → InspectionLocation`, so the real hierarchy a user perceives — *building →
floor → room → distribution board → circuit* — is actually spread over **two tables linked by a
nullable FK**, with `LOCATION` nodes in one and `ASSET` nodes in the other.

Three problems follow from this shape:

1. **The structure is ephemeral.** Because both tables cascade-delete with `InspectionPlan`, the
   tree is rebuilt from scratch for every inspection of the same physical site. A building's rooms,
   boards and circuits are a **durable real-world fact** that changes slowly; re-entering them each
   visit is wasteful and loses history. The recurring-inspection product story (re-inspect the same
   installation yearly) has no home for the structure between visits. This is open punt #2 in the
   integration plan.

2. **Two tables, one concept.** "Is this node a place or a thing?" is a *property* of a node, not a
   reason for two tables. The split forces a cross-table FK (`Asset.locationId`), duplicate tree
   plumbing (two `parentX` self-relations, two `treePath` columns, two sets of constraints via
   `AssetTypeConstraint` / `LocationTypeConstraint`), and duplicate sync/audit wiring. Tree queries
   (subtree, ancestors, move) have to be written and reasoned about twice.

3. **`treePath` is decorative.** It is a plain nullable string that nothing maintains. Subtree and
   ancestor lookups today require either recursive CTEs or repeated `parentId` walks in application
   code.

Meanwhile, an `InspectionPlan` is hard-bound to exactly one structure (the assets/locations it
cascade-owns) and currently denormalises the site address onto the plan itself
(`addressStreet`/`addressCity`/`gpsLatitude`…), even though the CRM already models the real site as
`imp_locations` (`Location`) hanging off `Contact`. There is no link between the inspection's
structure tree and the CRM location it physically describes.

## Decision

We make four coupled changes. **None are implemented yet — this ADR records the target design.**

### 1. One recursive table `AssetNode` replaces `Asset` + `InspectionLocation`

A single table `imp_asset_nodes` (`AssetNode`) holds **every** structural node. A discriminator
column distinguishes the two kinds:

```prisma
enum AssetNodeType {
  LOCATION
  ASSET
}
```

`nodeType = LOCATION` covers what `InspectionLocation` did (building / floor / room / area);
`nodeType = ASSET` covers what `Asset` did (board / circuit / appliance). The self-referential
`parentId` is the **single** tree edge — a board (`ASSET`) sits under a room (`LOCATION`) under a
building (`LOCATION`) with no cross-table hop. The old `Asset.locationId → InspectionLocation`
linkage is subsumed by ordinary parentage.

Type-specific columns coexist on the one table (most are already nullable): `assetType` /
`locationType` codes, `identifier`, `technicalData JSON`, `statusCode`, `LocationImage` (1:1, only
meaningful for `LOCATION` nodes), etc. The `AssetTypeDefinition` / `LocationTypeDefinition` config
models and their `*Constraint` allowed-parent rules are unchanged; they now both describe nodes in
one table.

### 2. The tree is persistent and scoped per CRM `Location`, not per `InspectionPlan`

`AssetNode` is **decoupled from `InspectionPlan`**. It no longer has `inspectionPlanId` and no
longer cascade-dies with a plan. Instead the tree is rooted at a **CRM location**:

- Every tree has exactly one **root node**, and the root has a **1:1 FK to `imp_locations`**
  (`AssetNode.rootLocationId → Location`, `@unique`). Non-root nodes have `rootLocationId = NULL`
  and reach their CRM location by climbing to the root.
- The structure therefore **outlives any single inspection**. Re-inspecting the same site reuses the
  same `AssetNode` tree; nodes accumulate execution history across plans (see split below).
- Soft-delete (`deletedAt`) replaces cascade as the way nodes disappear, preserving PWA-sync
  tombstone semantics.

This answers open punt #2 (structure persists, tied to CRM `Location`) and reframes open punt #3:
because the **structure** table no longer hangs off a plan, the "deep-table `orgId`" question
collapses — `AssetNode` keeps its own `orgId` (it is a top-level, plan-independent entity), which is
required now that there is no plan to scope it transitively.

### 3. Execution records gain a direct `inspectionPlanId`

The data *produced during a visit* must still be attributed to the specific inspection that produced
it. Those records get a **direct, non-nullable `inspectionPlanId`** (today several reach the plan
only transitively through `asset.inspectionPlanId`, which breaks once the node is shared across
plans):

| Model | Today | Target |
|---|---|---|
| `VisualInspection` | `assetId` only (plan via `asset`) | `assetNodeId` **+ `inspectionPlanId`** |
| `MeasurementRecord` | `assetId` only (plan via `asset`) | `assetNodeId` **+ `inspectionPlanId`** |
| `Finding` | `assetId` (+ optional VI/MR) | `assetNodeId` **+ `inspectionPlanId`** |
| `MeasurementSheetRecord` | `assetId` + optional `inspectionPlanId` | `assetNodeId` **+ required `inspectionPlanId`** |

`StandaloneMeasurement`, `Signature`, `Report`, `Photo` already carry `inspectionPlanId` and stay
as-is. Of these only `StandaloneMeasurement` has structural FKs to repoint (`locationId`,
`linkedAssetId` → `AssetNode`); `Signature`/`Report` have no asset/location FK, and `Photo` is
polymorphic (`entityType`/`entityId`) — no FK changes, but its `ASSET`/`LOCATION` enum values now
both resolve to `imp_asset_nodes`.

This is the heart of the **structure-vs-execution split**:

- **Structure** (`AssetNode`, `LocationImage`, `LocationImageMarker`) is *durable* and *plan-free* —
  the physical reality of a site.
- **Execution** (`VisualInspection`, `MeasurementRecord`, `Finding`, `MeasurementSheetRecord`,
  `StandaloneMeasurement`, `Signature`, `Report`, `Photo`) is *per-visit* and **always carries
  `inspectionPlanId`** — what a particular inspection observed about that structure.

### 4. An inspection targets one main location + N sub-locations

`InspectionPlan` is re-anchored to the CRM site and the structure subtree it covers:

- `InspectionPlan.locationId → Location` (`imp_locations`) names the single CRM **"hoofdlocatie"**
  the inspection belongs to. The denormalised `address*`/`gps*` columns on the plan become
  derivable from this location (kept for now, sourced from it).
- A new join table `InspectionPlanLocation` (`imp_inspection_plan_locations`,
  `@@unique([inspectionPlanId, assetNodeId])`, with a denormalised `orgId` for tenant-scope/
  `assertSameOrg` consistency and an `isPrimary` flag) records the **one-or-more `LOCATION` nodes**
  within that site's tree that the inspection actually targets. A plan can thus scope itself to
  "floor 2 + the main switchroom" without owning the whole tree, and two plans can target overlapping
  subtrees of the same persistent structure. Every targeted node must be a `LOCATION` whose tree root
  is `plan.locationId` (enforced in the service).

```
Contact ──< Location (CRM "hoofdlocatie")
                 │  1:1 (root only)
                 ▼
            AssetNode (root, LOCATION)        ← persistent structure, no plan FK
              ├─ AssetNode (floor, LOCATION)
              │    └─ AssetNode (room, LOCATION)
              │         └─ AssetNode (board, ASSET)
              │              └─ AssetNode (circuit, ASSET)
              └─ …

InspectionPlan ──(locationId)──► Location
InspectionPlan ──< InspectionPlanLocation >── AssetNode (targeted LOCATION nodes)

VisualInspection / MeasurementRecord / Finding / MeasurementSheetRecord
   ──(assetNodeId)──► AssetNode          (which structure node)
   ──(inspectionPlanId)──► InspectionPlan (which visit)
```

## Tree invariants

These hold for `imp_asset_nodes` and must be enforced (FK + trigger + service-layer `assertSameOrg`):

1. **Single rooting.** A node is a root **iff** `parentId IS NULL` **iff** `rootLocationId IS NOT
   NULL`. Exactly one of the two is set. Roots are 1:1 with a CRM `Location` (`rootLocationId`
   `@unique`); non-roots have `rootLocationId = NULL`.
2. **Connected & acyclic.** Every non-root has a parent in the same table; following `parentId`
   always terminates at the unique root. No cycles (the materialised path makes a cycle detectable —
   a node may never become a descendant of itself; the move operation must reject that).
3. **Single tenancy per tree.** A node, its parent, and its root share one `orgId`. Cross-tenant
   parentage is rejected (`assertSameOrg(parent, child)`).
4. **`path` ⟷ `parentId` consistency.** `path` always equals `parent.path || ownLabel` (root:
   `path = ownLabel`), and `depth = nlevel(path)`. Maintained by the trigger (§below); never written
   by application code.
5. **Type placement obeys constraints.** Allowed parent/child combinations are governed by the
   existing `AssetTypeConstraint` / `LocationTypeConstraint` allowed-parent rules. (`ASSET` nodes
   typically nest under `LOCATION` or `ASSET`; `LOCATION` nodes under `LOCATION` or a root.)
   Enforced in the service layer, not the DB.
6. **Structure carries no execution.** `AssetNode` rows never reference an `InspectionPlan`. Anything
   plan-specific lives on an execution record with its own `inspectionPlanId`.

## Materialised path with PostgreSQL `ltree`

We replace the decorative `treePath String?` with a **maintained materialised path** using the
PostgreSQL [`ltree`](https://www.postgresql.org/docs/current/ltree.html) extension, giving O(log n)
GiST-indexed subtree/ancestor queries without recursive CTEs.

### Extension and columns

```sql
CREATE EXTENSION IF NOT EXISTS ltree;
```

On `imp_asset_nodes`:

- `path ltree NOT NULL` — root-to-node label sequence (e.g. `a1b2….c3d4….e5f6…`).
- `depth integer NOT NULL` — denormalised `nlevel(path)`, handy for ordering/filtering by level.

In Prisma `path` is `Unsupported("ltree")` (Prisma has no native `ltree` type), so all path
reads/writes go through **raw SQL**; the trigger keeps it correct regardless of how rows are written
(including via the PWA sync mutator). The DB column is `NOT NULL`, but the Prisma field must be
declared **optional** (`Unsupported("ltree")?`) — or carry `@default(dbgenerated("''::ltree"))` —
because a required, defaultless `Unsupported` column makes Prisma Client `create()` fail (it cannot
supply a value). The `BEFORE INSERT` trigger runs before the NOT-NULL check, so the column is always
populated despite Prisma omitting it on insert.

### Labels = hyphen-stripped UUIDs

`ltree` labels may only contain `[A-Za-z0-9_]` (and `-` since PG 16, but we target portability and
do **not** rely on that). Our PKs are `@db.Uuid`, whose canonical text form contains `-`, which is
**not** a legal label character on the versions we support. So each node's label is its **UUID with
hyphens removed** (32 hex chars), e.g. `a1b2c3d4e5f6...`. A label that is all-hex and may start with
a digit is a valid `ltree` label. The mapping is reversible (re-insert hyphens at the 8-4-4-4-12
offsets) when a query needs to surface ids from a path.

### Trigger fills `path`/`depth`

A `BEFORE INSERT OR UPDATE` row trigger computes the node's own `path` and `depth` from its parent —
application code never sets them:

```sql
CREATE OR REPLACE FUNCTION imp_asset_nodes_set_path() RETURNS trigger AS $$
DECLARE
  parent_path ltree;
  self_label  text := replace(NEW.id::text, '-', '');   -- hyphen-stripped UUID
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := self_label::ltree;                       -- root
  ELSE
    SELECT path INTO parent_path FROM imp_asset_nodes WHERE id = NEW.parent_id;
    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'parent % has no path', NEW.parent_id;
    END IF;
    NEW.path := parent_path || self_label;               -- parent.path + own label
  END IF;
  NEW.depth := nlevel(NEW.path);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_nodes_set_path
  BEFORE INSERT OR UPDATE OF parent_id, id ON imp_asset_nodes
  FOR EACH ROW EXECUTE FUNCTION imp_asset_nodes_set_path();
```

> The row trigger fixes **only the changed row**. Re-parenting a node that has descendants requires
> rewriting the descendants too — that is the explicit *move* statement below, not the trigger.

### GiST index on `path`

```sql
CREATE INDEX imp_asset_nodes_path_gist ON imp_asset_nodes USING GIST (path);
```

This index backs the containment operators (`<@`, `@>`, `~`) used by every tree query.

### Raw-SQL tree queries

All scoped by `org_id` and `deleted_at IS NULL`:

```sql
-- Whole subtree of :node_path (node + all descendants)
SELECT * FROM imp_asset_nodes
WHERE path <@ :node_path AND org_id = :org AND deleted_at IS NULL
ORDER BY path;

-- Ancestors of :node_path (root → node, inclusive)
SELECT * FROM imp_asset_nodes
WHERE path @> :node_path AND org_id = :org
ORDER BY nlevel(path);

-- Direct children only (one level below)
SELECT * FROM imp_asset_nodes
WHERE path ~ (:node_path::text || '.*{1}')::lquery AND org_id = :org;

-- Depth of a node, and the label slice relative to its root
SELECT nlevel(path)              AS depth,
       subpath(path, 1)          AS path_below_root
FROM imp_asset_nodes WHERE id = :id;
```

`<@` = "is descendant of / contained by", `@>` = "is ancestor of / contains", `nlevel()` = label
count (depth), `subpath()` = relative slice. These replace recursive CTEs and `parentId` walking.

### Move operation rewrites descendant paths

Moving node `N` (current path `:old_path`) under a new parent (path `:new_parent_path`) is a single
statement that rewrites `N` **and** every descendant, preserving their relative positions:

```sql
-- Rewrite the whole subtree's path AND depth in one statement (depth is stored NOT NULL,
-- and the BEFORE-trigger only fixes the single re-parented row — not its descendants).
UPDATE imp_asset_nodes
SET path  = :new_parent_path || subpath(path, nlevel(:old_path) - 1),
    depth = nlevel(:new_parent_path || subpath(path, nlevel(:old_path) - 1))
WHERE path <@ :old_path AND org_id = :org;
-- then: UPDATE imp_asset_nodes SET parent_id = :new_parent_id WHERE id = :node_id;
--       (the trigger recomputes path/depth for the moved row, consistent with the rewrite above).
```

`subpath(path, nlevel(:old_path) - 1)` keeps the moved node's label plus its descendants' relative
tail, and prepends the new parent's path. **Both `path` and `depth` must be set in this UPDATE** —
the row trigger fires only for the re-parented node, so descendants would otherwise keep a stale
`depth`. (Alternative: drop the stored `depth` column entirely and always read `nlevel(path)`.) Guard
against cycles: reject the move if `:new_parent_path <@ :old_path` (cannot move a node beneath its own
descendant). Re-parenting across a different root (i.e. a different CRM `Location`) is disallowed by
invariant #3/§1 — a node belongs to one site's tree.

## Consequences

**Positive**

- The physical structure of a site is recorded **once** and reused across inspections; recurring
  inspections stop re-keying the tree. History accrues per node across plans.
- One table, one set of tree plumbing, one set of constraints, one sync/audit wiring — the
  `Asset.locationId` cross-table hop disappears.
- Subtree/ancestor/move become single GiST-indexed statements instead of recursive CTEs or N+1
  `parentId` walks; `treePath` stops being a lie.
- Clean structure-vs-execution separation makes "what does this site look like" and "what did this
  visit find" independently queryable.

**Negative / costs**

- `ltree` is a raw-SQL island Prisma cannot type (`Unsupported`); path columns are managed by trigger
  + raw queries, with a DB extension and trigger to maintain and test.
- This is a **breaking schema reshape** of `Asset`/`InspectionLocation` and the execution FKs. Per
  the integration plan there is **no data migration** (greenfield seed), so the cost is code/seed/PWA
  rework, not ETL — but the **PWA sync v2 contract is affected**: entity keys `assets` /
  `inspection_locations` collapse toward `asset_nodes`, and execution payloads must carry
  `inspectionPlanId`. The wire contract must be versioned/coordinated with the `Inspexi-App` repo
  before this lands (out of scope here).
- UUID-as-label coupling: the move/label logic assumes hyphen-stripped UUID labels; changing the PK
  strategy would ripple into the path encoding.

## Alternatives considered

- **Keep two tables, just persist them off the plan.** Solves persistence but keeps the cross-table
  FK and double plumbing; the "place vs thing" split stays a structural cost rather than a column.
- **Adjacency list only (`parentId`), recursive CTEs.** Simplest, but every subtree/ancestor read is
  a recursive CTE and moves stay cheap while reads stay O(subtree) without an index advantage; we
  already carry an (unused) `treePath`, signalling the intent was always a materialised path.
- **`treePath` as a maintained text column (no `ltree`).** Works, but we'd hand-roll containment
  with `LIKE 'prefix%'` and lose `nlevel`/`subpath`/lquery and the GiST operators. `ltree` is the
  purpose-built tool.

## Follow-ups (not in this ADR)

- Prisma model definitions for `AssetNode`, `AssetNodeType`, `InspectionPlanLocation` + the
  execution-record FK changes, and a `--create-only` migration carrying the extension, trigger and
  GiST index as raw SQL (`migrate dev` from `apps/api/`, never `db push`).
- Seed rework: build a persistent demo tree under a CRM `Location`, then attach the demo plan via
  `locationId` + `InspectionPlanLocation`.
- Audit registry, NL field labels, portal types, and PWA sync-contract versioning.
