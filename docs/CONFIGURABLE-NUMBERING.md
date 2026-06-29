# Configurable record numbering (per org, per model)

Status: in progress — branch `feat/configurable-record-numbering`.

Replaces the race-prone `generateOrgSequentialNumber` (`max+1` scan, no retry) with a
generic, per-organization **and per-model** numbering engine. The UUID stays the real PK;
the human number is a separate, **unique-per-org** field guarded by a DB constraint + an
atomic counter + retry.

## Scope (this build)

| Model   | Number field           | Source              |
| ------- | ---------------------- | ------------------- |
| Request | `requestNumber` (new)  | new field + backfill |
| Quote   | `quoteNumber` (exists) | migrate to engine    |
| Project | `projectNumber` (exists) | migrate to engine  |
| Product | `productCode` (new)    | new field + backfill |
| WorkOrder | `workOrderNumber`    | migrate to engine    |
| **LOCATION_NODE** | `AssetNode.nodeNumber` (new) | server-assigned on LOCATION-node create + backfill |
| **ASSET_NODE**    | `AssetNode.nodeNumber` (new) | server-assigned on ASSET-node create + backfill |

WorkOrder / Location / Contact follow later — the engine is generic (extend `NumberingModel`).
A future Invoice model plugs in as one more `NumberingModel` value + default scheme.

**AssetNode numbering (LOCATION_NODE + ASSET_NODE).** The unified AssetNode tree gets
**two independent schemes** that both write the single `AssetNode.nodeNumber` column
(`@@unique([orgId, nodeNumber])`); the distinct prefix/shortcode keep the strings apart
and the P2002-retry covers any collision. `nodeType` picks the scheme: a LOCATION-node
uses `LOCATION_NODE` (default `LOC-####`, CONTINUOUS), an ASSET-node uses `ASSET_NODE`
(default `[typecode]-####`, CONTINUOUS, e.g. `VERD-0001`). `nodeNumber` is **server-owned**
(like `orgId`): assigned in `AssetNodesService.create`/`createRoot` and in the `/sync`
assetNodes push-create path; the PWA never sends it. A manual number is accepted on
create only when the scheme allows it.

**New placeholder `[typecode]`.** Allowed for `LOCATION_NODE`/`ASSET_NODE` only. It
resolves to the sanitized `shortCode` of the matching type definition
(`AssetTypeDefinition` for ASSET, `LocationTypeDefinition` for LOCATION, looked up by
`(orgId|null, typeCode)`, org-specific wins). A type without a shortcode → empty string
(safe; uniqueness still comes from the autonumber).

## Data model

### Enums

- `NumberingModel { REQUEST, QUOTE, PROJECT, PRODUCT, WORK_ORDER, LOCATION_NODE, ASSET_NODE }` — extendable.
- `NumberingMode { SEQUENTIAL, RANDOM }`.
- `NumberingReset { CONTINUOUS, PER_YEAR, PER_MONTH }`.

### `NumberingScheme` (`imp_numbering_schemes`) — config, one per `(orgId, model)`

`id`, `orgId` (FK), `model`, `prefix`, `suffix`, `mode` (default SEQUENTIAL), `start`
(default 1), `interval` (default 1), `digits` (default 4), `resetPolicy` (default
CONTINUOUS), `allowManualEntry` (default false), `isActive`, timestamps.
`@@unique([orgId, model])`. No soft-delete — there are exactly 4 rows per org, auto-provisioned
(seed + lazy `ensureScheme`), only ever edited. Endpoints are GET (list/one) + PATCH + preview.

### `NumberingCounter` (`imp_numbering_counters`) — atomic counter

`id`, `schemeId` (FK, cascade), `periodKey` (`""` | `"2026"` | `"2026-03"`), `value`,
`updatedAt`. `@@unique([schemeId, periodKey])`. `value` = **last issued** counter value.

### New fields

- `Request.requestNumber String?` + `@@unique([orgId, requestNumber])`.
- `Product.productCode String?` + `@@unique([orgId, productCode])`.

Nullable so existing rows (NULL) don't violate uniqueness (Postgres allows multiple NULLs);
backfill populates them.

## Engine (`NumberingService`)

`@Global` module so the 4 consumer modules inject `NumberingService` without import edits.

- `ensureScheme(orgId, model)` → upserts a default scheme if missing (defaults reproduce
  today's formats: Quote `OFF-[jaar]-####` PER_YEAR, Project `P-[jaar]-####` PER_YEAR,
  Request `AANV-[jaar]-####` PER_YEAR, Product `PRD-####` CONTINUOUS).
- `periodKey(resetPolicy, date)` → `""` / `YYYY` / `YYYY-MM`.
- **Atomic counter bump** — single raw statement inside the caller's tx, no `max+1` scan:
  ```sql
  INSERT INTO imp_numbering_counters (id, scheme_id, period_key, value, updated_at)
  VALUES (gen_random_uuid(), $schemeId, $periodKey, $start, now())
  ON CONFLICT (scheme_id, period_key)
  DO UPDATE SET value = imp_numbering_counters.value + $interval, updated_at = now()
  RETURNING value;
  ```
  First issue in a period = `start`; subsequent = previous + `interval`. Seeded counters
  start **at the current max**, so new numbers continue without collision or renumbering.
- **Placeholder resolution** in prefix/suffix: date (`[jaar]`/`[maand]`/`[dag]`) + per-model
  data-driven catalog. Missing data → empty (safe); uniqueness comes from the autonumber.
  - REQUEST/QUOTE/PROJECT: `[jaar] [maand] [dag] [postcode] [contact]`
  - WORK_ORDER: `[jaar] [maand] [dag] [postcode] [huisnummer] [contact]`
  - PRODUCT: `[jaar] [maand] [dag] [groep]`
  - LOCATION_NODE/ASSET_NODE: `[jaar] [maand] [dag] [typecode]` (`[typecode]` = type-def `shortCode`)
  - Data values are sanitized (uppercased, non-alphanumerics stripped).
- **Compose**: `resolve(prefix) + zeroPad(value, digits) + resolve(suffix)`. RANDOM uses a
  `digits`-wide random number as the numeric part.
- `runWithGeneratedNumber(model, orgId, { context, manual }, create)` — centralizes:
  - manual provided + `allowManualEntry` → use it (pre-check uniqueness, DB constraint backstop);
    manual provided while disabled → 400.
  - else → retry loop: `$transaction(tx => { value = bump; number = compose; return create(tx, number) })`,
    catching P2002 on the number column and regenerating (SEQUENTIAL bumps again; RANDOM re-rolls).
    Bounded attempts; exhausted RANDOM space → clear 409. Counter bump shares the tx, so a failed
    create rolls the counter back too.

## Backfill

Migration is **schema-only** (enums/tables/columns/constraints) → replays clean on an empty
shadow DB. Data backfill lives in:

- **seed.ts** (dev): creates the 4 schemes per org, assigns numbers to seeded
  request/product rows, keeps existing quote/project numbers, and writes `NumberingCounter`
  rows at the max it issued. Cleanup order: `numberingCounter` → `numberingScheme` before
  `organization`.
- **`prisma/backfill-numbering.ts`** (prod-like, idempotent): ensures schemes, assigns numbers
  to existing NULL request/product rows in `createdAt` order, and seeds counters at the current
  max per `(org, model, period)` for all 4 models.

## Tests

Unit: placeholder resolution, zero-pad, period keys, sequential start/interval, random retry,
manual-entry validation, P2002 collision → regenerate. E2E: create yields a generated number,
manual allowed vs blocked (400), cross-tenant isolation of schemes and numbers.
