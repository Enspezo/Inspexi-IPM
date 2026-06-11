# Implementatieplan — ENUM aanpassingen

Concreet, gefaseerd plan op basis van `enum-analysis.md`. Niets is gewijzigd in de codebase; dit is de uit te voeren volgorde met exacte diffs en touchpoints. Uit te voeren in Claude Code.

## Prioritering

| Fase | Wijziging | Risico | Impact | Doen wanneer |
|---|---|---|---|---|
| 1 | `lost_reason` → lookup table | Laag | 1 module | Nu |
| 2 | `contact_person_role` → lookup table | Laag | 1 module | Nu |
| 3 | Status-metadata uit frontend-hardcoding | Laag | Frontend | Kort daarna |
| 4 | `entityType`-consistentie opruimen | Laag-mid | 3 velden | Opportuun |
| 5 | `log_type` / `request_source` / `task_type` / `follow_up_type` | Mid | Per enum | Alleen bij klantvraag |

Principe voor fase 1–2: **expand-and-contract**. Eerst kolom + backfill toevoegen (oude enum blijft staan), code omzetten, pas in een latere migratie de oude enum-kolom droppen. Omdat het project nog in seed-/dev-fase zit kun je het ook in één migratie doen — de losse-migratie-variant staat onderaan.

---

## Fase 1 — `lost_reason` → lookup table

Enige gebruiker: `Request.lostReason` (nullable enum). DTO: `update-request-status.dto.ts`. Service: `requests.service.ts`. Geen state-machine-logica eraan vast → veilig.

### 1.1 Schema — nieuw model + relatie

`apps/api/prisma/schema.prisma`:

```prisma
model LostReason {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String?  @map("org_id") @db.Uuid   // null = globale default
  code      String                              // stabiele sleutel, bijv. "TE_DUUR"
  label     String                              // NL weergave, bewerkbaar
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  isSystem  Boolean  @default(false) @map("is_system")
  createdAt DateTime @default(now()) @map("created_at")

  organization Organization? @relation(fields: [orgId], references: [id])
  requests     Request[]

  @@unique([orgId, code])
  @@index([orgId, isActive])
  @@map("imp_lost_reasons")
}
```

Op `Request`:

```prisma
-  lostReason  LostReason?   @map("lost_reason")
+  lostReasonId String?      @map("lost_reason_id") @db.Uuid
   lostNote    String?       @map("lost_note")
   ...
+  lostReasonRef LostReason? @relation(fields: [lostReasonId], references: [id])
```

Op `Organization` de back-relation toevoegen: `lostReasons LostReason[]`.

> Laat de `enum LostReason { ... }` definitie **voorlopig** staan; pas verwijderen in de contract-migratie (1.5).

### 1.2 Migratie + backfill

```bash
cd apps/api
npx prisma migrate dev --name add-lost-reason-lookup
```

Voeg in de gegenereerde migratie ná het aanmaken van `imp_lost_reasons` een seed + backfill toe (raw SQL), zodat bestaande rijen niet wijzen naar niets:

```sql
-- Globale defaults (org_id NULL), code identiek aan oude enum-waarden
INSERT INTO imp_lost_reasons (id, org_id, code, label, sort_order, is_active, is_system, created_at) VALUES
  (gen_random_uuid(), NULL, 'TE_DUUR',              'Te duur',            10, true, true, now()),
  (gen_random_uuid(), NULL, 'GEEN_BESCHIKBAARHEID', 'Geen beschikbaarheid',20, true, true, now()),
  (gen_random_uuid(), NULL, 'NIET_LANGER_NODIG',    'Niet langer nodig',  30, true, true, now()),
  (gen_random_uuid(), NULL, 'ANDERS',               'Anders',             40, true, true, now());

-- Backfill bestaande requests: enum-tekstwaarde → lookup-rij
UPDATE imp_requests r
SET lost_reason_id = lr.id
FROM imp_lost_reasons lr
WHERE lr.org_id IS NULL
  AND lr.code = r.lost_reason::text
  AND r.lost_reason IS NOT NULL;
```

### 1.3 Backend code

- `dto/update-request-status.dto.ts`: vervang `lostReason?: LostReason` (`@IsEnum`) door `lostReasonId?: string` (`@IsUUID` + `@IsOptional`).
- `requests.service.ts`: waar `lostReason` werd gezet bij overgang naar `VERLOREN`, nu `lostReasonId` doorzetten; valideer dat de id bestaat en hoort bij `orgId` of een globale default is (`org_id IS NULL OR org_id = user.orgId`). Includeer `lostReasonRef` in detail-queries.
- Nieuw mini-endpoint voor de dropdown: `GET /lost-reasons` → actieve reasons voor `orgId` + globale defaults, gesorteerd op `sortOrder`. (Volg het bestaande module-patroon; flat array retourneren zoals `GET /users`.)

### 1.4 Frontend

- `apps/portal/src/types/index.ts`: `LostReason` interface toevoegen; `Request.lostReason` enum-veld → `lostReasonId: string | null` + optioneel `lostReasonRef`.
- Hook `useLostReasons()` toevoegen (TanStack Query, zoals `useUsers()` — **geen** handmatige `apiClient.get` in `useEffect`).
- In het "Verloren"-formulier de hardcoded enum-opties vervangen door de hook-data.
- `apps/portal/src/lib/audit-value-format.ts`: de `LostReason`-enum→label mapping **verwijderen** (waarde is nu een UUID).

### 1.5 Audit trail (belangrijk!)

Na conversie wordt de gewijzigde kolom `lostReasonId` een UUID in de audit-log. Voeg daarom in `apps/api/src/modules/audit-log/audit-log.service.ts` een resolver toe aan `FK_FIELD_RESOLVERS` voor `lostReasonId` (batch-lookup → `label`), net als de bestaande resolvers voor `contactId`/`ownerId`. Voeg de Nederlandse veldlabel toe in `apps/portal/src/lib/audit-field-labels.ts` voor de `Request`-entity (`lostReasonId` → "Reden verloren").

### 1.6 Seed + cleanup volgorde

- `apps/api/prisma/seed.ts`: seed de globale `lostReason`-defaults; in de cleanup-volgorde `lostReason.deleteMany()` plaatsen **vóór** `request` (kind-eerst principe is hier andersom: Request verwijst náár LostReason, dus verwijder eerst requests, dan lostReasons — net als product vóór productGroup). Concreet: `request` blijft staan zoals nu, `lostReason.deleteMany()` ná de requests.

### 1.7 Contract-migratie (apart, ná deploy)

Pas als de code draait op de FK:

```bash
cd apps/api
npx prisma migrate dev --name drop-lost-reason-enum
```

Verwijder `enum LostReason` uit `schema.prisma` en de oude `lost_reason`-kolom op `imp_requests`. Prisma dropt dan het Postgres-enumtype.

---

## Fase 2 — `contact_person_role` → lookup table

Enige gebruiker: `ContactPerson.role` (NOT NULL enum, default `ALGEMEEN`). DTO: `create-contact-person.dto.ts`. Zelfde patroon, met één verschil: de kolom is **NOT NULL**.

### 2.1 Schema

```prisma
model ContactPersonRoleOption {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String?  @map("org_id") @db.Uuid
  code      String
  label     String
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  isSystem  Boolean  @default(false) @map("is_system")
  createdAt DateTime @default(now()) @map("created_at")

  organization   Organization?   @relation(fields: [orgId], references: [id])
  contactPersons ContactPerson[]

  @@unique([orgId, code])
  @@map("imp_contact_person_roles")
}
```

> Modelnaam bewust `ContactPersonRoleOption` om te botsen-voorkomen met de bestaande enum-naam tijdens de expand-fase.

Op `ContactPerson`:

```prisma
-  role      ContactPersonRole @default(ALGEMEEN)
+  roleId    String?           @map("role_id") @db.Uuid
   ...
+  roleRef   ContactPersonRoleOption? @relation(fields: [roleId], references: [id])
```

Maak `roleId` **nullable**; behandel `null` in de app als "Algemeen". Een dynamische UUID-default in Postgres kan niet, dus de default wordt app-zijdig gezet (DTO default → de `ALGEMEEN`-rij voor die org/globaal).

### 2.2 Migratie + backfill

Seed defaults (`ALGEMEEN`, `TECHNISCH`, `ADMINISTRATIEF`, `ANDERS`) als globale rijen, dan:

```sql
UPDATE imp_contact_persons cp
SET role_id = o.id
FROM imp_contact_person_roles o
WHERE o.org_id IS NULL AND o.code = cp.role::text;
```

### 2.3 Backend / Frontend / Audit

Zelfde stappenset als 1.3–1.6:

- DTO: `role: ContactPersonRole` (`@IsEnum`) → `roleId?: string` (`@IsUUID`, optioneel). Service zet bij ontbreken de `ALGEMEEN`-rij.
- `contacts.service.ts`: `roleRef` includen; org-validatie op `roleId`.
- Endpoint `GET /contact-person-roles` + hook `useContactPersonRoles()`.
- Frontend dropdowns in `create-contact-person-modal.tsx`, `add-contact-person-modal.tsx`, `link-contact-person-modal.tsx` en weergave in `contact-person-detail-page.tsx` omzetten naar hook-data.
- `audit-value-format.ts`: `ContactPersonRole` mapping verwijderen.
- `audit-log.service.ts`: FK-resolver voor `roleId` (→ `label`); `audit-field-labels.ts`: label "Rol" voor `ContactPerson`.

### 2.4 Contract-migratie

Apart, ná deploy: `enum ContactPersonRole` en oude `role`-kolom droppen.

---

## Fase 3 — Status-metadata uit frontend-hardcoding

De status-enums (`request_status`, `quote_status`, `task_status`, `planning_status`, `session_status`, `project_status`, `work_order_status`, `error_report_status`) **blijven enums** — niet aanraken qua waarden, de state machines hangen eraan. Doel hier: label/kleur/sorteervolgorde centraliseren i.p.v. verspreid hardcoded.

Concreet, laagste risico: één config-map per enum in de frontend.

```ts
// apps/portal/src/lib/status-config.ts
export const REQUEST_STATUS_CONFIG: Record<RequestStatus, {
  label: string; color: string; sortOrder: number; isTerminal: boolean;
}> = {
  NIEUW:           { label: 'Nieuw',           color: 'gray',   sortOrder: 10, isTerminal: false },
  IN_BEHANDELING:  { label: 'In behandeling',  color: 'blue',   sortOrder: 20, isTerminal: false },
  OFFERTE_GEMAAKT: { label: 'Offerte gemaakt', color: 'indigo', sortOrder: 30, isTerminal: false },
  GEWONNEN:        { label: 'Gewonnen',        color: 'green',  sortOrder: 40, isTerminal: true  },
  VERLOREN:        { label: 'Verloren',        color: 'red',    sortOrder: 50, isTerminal: true  },
  ON_HOLD:         { label: 'On hold',         color: 'amber',  sortOrder: 60, isTerminal: false },
};
```

Vervang vervolgens de losse label/kleur-mappings in de kanban (`requests-kanban.tsx`), badges en `audit-value-format.ts` door deze single source. Herhaal per status-enum. Geen migratie nodig.

> Pas een echte `status_metadata`-tabel of tenant-bewerkbare statussen aan wanneer klanten eigen statussen/kleuren eisen — dat vergt een data-gedreven state machine en is een apart, groter traject.

---

## Fase 4 — `entityType`-consistentie

Nu inconsistent: `Task`, `Document`, `Note`, `CustomFieldDefinition` gebruiken een enum-`entityType`, maar `Notification.entityType`, `AuditLog.entityType` en `PlanningHistory.action` zijn vrije `String`.

Keuze (kies één lijn):

- **Optie A (aanbevolen):** laat audit/notification `entityType` bewust vrij `String` — zij loggen óók entiteiten die geen eigen enum hebben, dus een enum zou te krap zijn. Documenteer dit expliciet in `CLAUDE.md` als bewuste keuze, en voeg een gedeelde runtime-validatieconstante toe (`KNOWN_ENTITY_TYPES`) zodat schrijvers niet vrijuit typo's introduceren.
- **Optie B:** introduceer één gedeelde `EntityType`-enum en migreer alle velden ernaartoe. Strakker, maar je verliest flexibiliteit voor toekomstige entiteiten en het raakt meer code.

`PlanningHistory.action` is een apart geval: dat is geen entity-type maar een vrije actie-omschrijving — laat als `String`, of maak er een kleine `planning_action`-enum van als de set acties stabiel is.

Aanbeveling: **Optie A** — laag risico, documenteert de bestaande bewuste keuze.

---

## Fase 5 — Optionele lookup-kandidaten

Alleen uitvoeren bij concrete behoefte aan per-org maatwerk. Zelfde patroon als fase 1.

- `log_type`, `request_source`: puur labels, goedkope conversie.
- `task_type`, `follow_up_type`: sturen ook icoon-/kanaalkeuze in code — bij conversie een `code`-veld behouden zodat de code daarop kan blijven schakelen.

---

## Test- & verificatie-checklist (per fase)

1. `cd apps/api && npx prisma migrate dev` draait schoon vanuit `apps/api/` (niet root).
2. Backfill-query: `SELECT count(*) FROM imp_requests WHERE lost_reason IS NOT NULL AND lost_reason_id IS NULL` → moet **0** zijn vóór de contract-migratie.
3. `pnpm test` (API unit, 163+) en `pnpm test:e2e` (107+) groen; let op E2E-teardown `auditLog.deleteMany()` bij nieuwe FK's naar User — hier niet van toepassing, maar nieuwe lookup-tabellen toevoegen aan de seed-cleanup.
4. `npx turbo run build` vanuit root → TypeScript errors in beide packages gevangen (DTO-, type- en hook-wijzigingen).
5. UI-rooktest: aanvraag op "Verloren" zetten met reden; contactpersoon aanmaken met rol; audit-tab toont leesbare labels (geen kale UUID's).
6. Swagger `/api/docs`: nieuwe `GET /lost-reasons` en `GET /contact-person-roles` zichtbaar.

## Rollback

Expand-and-contract maakt rollback simpel: zolang de contract-migratie (enum-kolom droppen) niet is gedraaid, blijft de oude `lost_reason`/`role`-kolom intact en kun je de code terugdraaien zonder dataverlies. Voer de contract-migratie pas uit nadat de FK-versie minstens één keer stabiel heeft gedraaid.
