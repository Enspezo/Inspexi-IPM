# Database Optimization Plan

Analyse uitgevoerd op 2026-06-12 op basis van `apps/api/prisma/schema.prisma` (1495 regels, 40 bestaande indexes) en de querypatronen in de service-laag.

Statuslegenda: ☐ open · ☑ done

## Stap 1 — Ontbrekende indexes (☑, hoogste prioriteit)

PostgreSQL indexeert FK-kolommen niet automatisch. Eén Prisma-migratie, geen codewijzigingen.

**Hot paths:**
- `Notification`: `@@index([userId, isRead])` + `@@index([userId, createdAt])` — elke gebruiker queryt continu unread-count en notificatielijst
- `RefreshToken`: `@@index([userId])` + `@@index([expiresAt])` — elke token-refresh/login/sessie-overzicht
- `QuoteLine`: `@@index([quoteId])`
- `WorkOrderLine`: `@@index([workOrderId])`
- `QuoteApprovalRequest`: `@@index([quoteId])`
- `RequestStatusHistory`: `@@index([requestId])`

**CRM child-tabellen** (contact-detailpagina laadt ze allemaal):
- `ContactAddress`: `@@index([contactId])`
- `ContactPerson`: `@@index([contactId])`
- `Location`: `@@index([contactId])`
- `ContactLog`: `@@index([contactId])`
- `ContactEmail`: `@@index([contactId])`

**Filterkolommen hoofdtabellen:**
- `Request`: `@@index([contactId])`, `@@index([assignedTo])`, `@@index([projectId])`
- `Quote`: `@@index([contactId])`, `@@index([requestId])`, `@@index([projectId])`
- `PlanningItem`: `@@index([quoteId])`, `@@index([projectId])`
- `Task`: `@@index([orgId, deadline])`, `@@index([createdById])`
- `Contact`: `@@index([ownerId])`
- `PriceTableItem`: `@@index([priceTableId])`, `@@index([productId])`
- `PriceTier`: `@@index([priceTableItemId])`
- `Invitation`: `@@index([orgId, email])`

Migratie: `cd apps/api && npx prisma migrate dev --name add-missing-indexes`

## Stap 2 — Geld als Decimal i.p.v. Float (☑, correctheidsissue)

Floating-point geeft afrondingsfouten bij BTW/kortingsberekeningen. Wijzig naar `Decimal @db.Decimal(12, 2)`:

- `Quote`: `subtotal`, `discountTotal`, `vatTotal`, `total`
- `QuoteLine`: `unitPrice`, `lineTotal` (NB: `quantity`, `vatRate`, `discountPct` blijven Float)
- `WorkOrderLine`: `unitPrice`, `lineTotal`
- `PriceTier`: `price`
- `PriceTableItem`: `basePrice`

**Let op service-laag**: Prisma retourneert dan `Prisma.Decimal` i.p.v. `number`. Berekeningen in `quotes.helpers.ts` en aanverwante services moeten met `Number(...)` conversie of Decimal-arithmetiek werken; API-responses moeten numbers blijven serialiseren (JSON-serialisatie van Decimal is string — converteer expliciet waar de frontend numbers verwacht). Unit tests bijwerken.

Migratie: `npx prisma migrate dev --name money-fields-to-decimal` (ALTER COLUMN ... TYPE numeric(12,2) — verliesvrij voor bestaande data binnen 2 decimalen).

## Stap 3 — pg_trgm GIN-indexes voor zoeken (☐, bij schaal)

`contains` + `mode: 'insensitive'` → `ILIKE '%term%'` kan geen b-tree gebruiken. Raw SQL-migratie:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX imp_contacts_search_trgm ON imp_contacts
  USING gin (company_name gin_trgm_ops, first_name gin_trgm_ops, last_name gin_trgm_ops, email gin_trgm_ops);
```

Vergelijkbaar voor `imp_requests.title` en `imp_quotes.subject/quote_number`. Pas relevant > ~10k rijen per org.

## Stap 4 — Partial indexes voor soft deletes (☐, nice-to-have)

Raw SQL: `CREATE INDEX ... WHERE is_deleted = false` voor kleinere/snellere indexes op `imp_contacts`, `imp_requests`, `imp_tasks`, `imp_documents`. Pas relevant bij veel verwijderde records.

## Stap 5 — Groei & onderhoud (☐)

- `AuditLog`: retentiebeleid (cron, verwijder > 1–2 jaar) of partitionering op `createdAt`
- `RefreshToken`: periodieke cleanup van verlopen/ingetrokken tokens
- `ErrorReport`: `@@index([orgId])` toevoegen zodra per-org filtering nodig is

## Stap 6 — Schema-consistentie (☑, cosmetisch)

- `ContactCustomerGroup`: surrogaat-`id` + `@@unique` vervangen door composite `@@id([contactId, customerGroupId])` (consistent met `ContactPriceTable`)
- `updatedAt DateTime @updatedAt` toevoegen aan `Contact`, `ContactPerson`, `Location`, `ContactAddress`
- `PlanningSession.replacedById`/`replacesId`: `@db.Uuid` toevoegen (consistent met `PlanningItem`)

Migratie: `npx prisma migrate dev --name schema-consistency`
