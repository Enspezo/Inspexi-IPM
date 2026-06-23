# IMP_PRD_10 — Fase 1: schema, migratie & seed (paste-ready)

> Begeleidend bij `IMP_PRD_10_Helpsysteem.md`. Dit is **Fase 1**: datamodel + migraties + seed + audit-registratie.
> Alle blokken zijn copy-paste-klaar voor Claude Code. Volg de volgorde van onder naar boven (schema → migratie → audit → seed → verificatie).
> Conventies: Prisma vanuit `apps/api/`, **nooit `prisma db push`**, altijd `migrate dev`.

## Te wijzigen bestanden

1. `apps/api/prisma/schema.prisma` — enums, 4 nieuwe modellen, velden + back-relations op `Organization` en `User`, 2 enum-uitbreidingen.
2. `apps/api/src/common/audit/audited-entities.ts` — 3 entries toevoegen aan `AUDITED_ENTITIES`.
3. `apps/api/prisma/seed.ts` — cleanup-`deleteMany` + seed-data.
4. Twee migraties via CLI (de 2e met raw SQL voor `pg_trgm`).

---

## 1. `schema.prisma` — nieuwe enums

Plaats bij de overige enums (bovenin het schema).

```prisma
enum HelpArticleStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum SupportTicketStatus {
  NIEUW
  IN_BEHANDELING
  WACHT_OP_KLANT
  OPGELOST
  GESLOTEN
}

enum SupportTicketPriority {
  LAAG
  NORMAAL
  HOOG
  URGENT
}

enum SupportTicketCategory {
  VRAAG
  PROBLEEM
  BUG
  FEATURE_REQUEST
  FACTUUR
  OVERIG
}

enum SupportMessageAuthorType {
  USER
  SUPPORT
  SYSTEM
}

enum SupportAccessAction {
  ENABLED
  DISABLED
  EXPIRED
  ACCESSED
}
```

## 2. `schema.prisma` — uitbreiding bestaande enums

Voeg één waarde toe aan elk (alvast nu, gebruikt in Fase 4 — scheelt een latere enum-migratie):

```prisma
// in enum DocumentEntityType { ... }  → toevoegen:
  SUPPORT_TICKET

// in enum NumberingModel { ... }      → toevoegen:
  SUPPORT_TICKET
```

## 3. `schema.prisma` — nieuwe modellen

Plaats onderaan bij de overige modellen.

```prisma
// ─── Helpsysteem: Knowledge base (hybride: org_id null = globaal) ───────────

model HelpCategory {
  id          String   @id @default(uuid()) @db.Uuid
  orgId       String?  @map("org_id") @db.Uuid          // null = globaal; gezet = org-specifiek
  slug        String
  name        String
  description String?
  icon        String?
  order       Int      @default(0)
  parentId    String?  @map("parent_id") @db.Uuid
  isPublished Boolean  @default(true) @map("is_published")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  organization Organization?  @relation(fields: [orgId], references: [id])
  parent       HelpCategory?  @relation("HelpCategoryTree", fields: [parentId], references: [id])
  children     HelpCategory[] @relation("HelpCategoryTree")
  articles     HelpArticle[]

  @@unique([orgId, slug])
  @@index([parentId, order])
  @@map("imp_help_categories")
}

model HelpArticle {
  id          String            @id @default(uuid()) @db.Uuid
  orgId       String?           @map("org_id") @db.Uuid // null = globaal; gezet = org-specifiek
  categoryId  String            @map("category_id") @db.Uuid
  slug        String
  title       String
  excerpt     String?
  body        String            @db.Text
  status      HelpArticleStatus @default(DRAFT)
  tags        String[]          @default([])
  moduleKeys  String[]          @default([]) @map("module_keys")
  order       Int               @default(0)
  viewCount   Int               @default(0) @map("view_count")
  helpfulYes  Int               @default(0) @map("helpful_yes")
  helpfulNo   Int               @default(0) @map("helpful_no")
  authorId    String?           @map("author_id") @db.Uuid
  publishedAt DateTime?         @map("published_at")
  createdAt   DateTime          @default(now()) @map("created_at")
  updatedAt   DateTime          @updatedAt @map("updated_at")

  organization Organization? @relation(fields: [orgId], references: [id])
  category     HelpCategory  @relation(fields: [categoryId], references: [id])
  author       User?         @relation("HelpArticleAuthor", fields: [authorId], references: [id])

  @@unique([orgId, slug])
  @@index([orgId, status])
  @@index([categoryId, order])
  @@map("imp_help_articles")
}

// ─── Helpsysteem: Support tickets (org-scoped) ──────────────────────────────

model SupportTicket {
  id              String                @id @default(uuid()) @db.Uuid
  orgId           String                @map("org_id") @db.Uuid
  ticketNumber    Int                   @map("ticket_number")
  subject         String
  description     String                @db.Text
  status          SupportTicketStatus   @default(NIEUW)
  priority        SupportTicketPriority @default(NORMAAL)
  category        SupportTicketCategory @default(VRAAG)
  contextModule   String?               @map("context_module")
  contextUrl      String?               @map("context_url")
  createdById     String                @map("created_by_id") @db.Uuid
  assignedToId    String?               @map("assigned_to_id") @db.Uuid
  firstResponseAt DateTime?             @map("first_response_at")
  resolvedAt      DateTime?             @map("resolved_at")
  closedAt        DateTime?             @map("closed_at")
  lastMessageAt   DateTime?             @map("last_message_at")
  isDeleted       Boolean               @default(false) @map("is_deleted")
  createdAt       DateTime              @default(now()) @map("created_at")
  updatedAt       DateTime              @updatedAt @map("updated_at")

  organization Organization           @relation(fields: [orgId], references: [id])
  createdBy    User                   @relation("SupportTicketCreatedBy", fields: [createdById], references: [id])
  assignedTo   User?                  @relation("SupportTicketAssignedTo", fields: [assignedToId], references: [id])
  messages     SupportTicketMessage[]

  @@unique([orgId, ticketNumber])
  @@index([orgId, status])
  @@index([createdById])
  @@index([assignedToId])
  @@map("imp_support_tickets")
}

model SupportTicketMessage {
  id         String                   @id @default(uuid()) @db.Uuid
  ticketId   String                   @map("ticket_id") @db.Uuid
  orgId      String                   @map("org_id") @db.Uuid
  authorId   String?                  @map("author_id") @db.Uuid
  authorType SupportMessageAuthorType @default(USER) @map("author_type")
  body       String                   @db.Text
  isInternal Boolean                  @default(false) @map("is_internal")
  createdAt  DateTime                 @default(now()) @map("created_at")

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author User?         @relation("SupportTicketMessageAuthor", fields: [authorId], references: [id])

  @@index([ticketId, createdAt])
  @@map("imp_support_ticket_messages")
}

// ─── Helpsysteem: Support-toegang log (org-scoped) ──────────────────────────

model SupportAccessLog {
  id              String              @id @default(uuid()) @db.Uuid
  orgId           String              @map("org_id") @db.Uuid
  action          SupportAccessAction
  performedById   String?             @map("performed_by_id") @db.Uuid
  performedByRole Role?               @map("performed_by_role")
  ip              String?
  userAgent       String?             @map("user_agent")
  note            String?
  createdAt       DateTime            @default(now()) @map("created_at")

  organization Organization @relation(fields: [orgId], references: [id])
  performedBy  User?        @relation("SupportAccessLogPerformedBy", fields: [performedById], references: [id])

  @@index([orgId, createdAt])
  @@map("imp_support_access_logs")
}
```

## 4. `schema.prisma` — wijzigingen op `Organization`

Voeg twee velden toe (bij de overige scalar-velden, naast `chatEnabled`):

```prisma
  // Support-toegang: expliciete, geauditeerde consent voor InspeXi-support.
  supportAccessEnabled   Boolean   @default(false) @map("support_access_enabled")
  supportAccessExpiresAt DateTime? @map("support_access_expires_at")
```

En vier back-relations (bij de overige relation-lijsten van `Organization`):

```prisma
  helpCategories    HelpCategory[]
  helpArticles      HelpArticle[]
  supportTickets    SupportTicket[]
  supportAccessLogs SupportAccessLog[]
```

## 5. `schema.prisma` — back-relations op `User`

Voeg toe bij de overige relation-lijsten van `User` (de relation-namen moeten exact matchen met de modellen hierboven):

```prisma
  helpArticles           HelpArticle[]          @relation("HelpArticleAuthor")
  createdSupportTickets  SupportTicket[]        @relation("SupportTicketCreatedBy")
  assignedSupportTickets SupportTicket[]        @relation("SupportTicketAssignedTo")
  supportTicketMessages  SupportTicketMessage[] @relation("SupportTicketMessageAuthor")
  supportAccessLogs      SupportAccessLog[]     @relation("SupportAccessLogPerformedBy")
```

---

## 6. Migraties

**Migratie 1 — modellen, enums, velden:**

```bash
cd apps/api
npx prisma migrate dev --name add_help_system
```

**Migratie 2 — fuzzy zoeken (raw SQL, `--create-only` zodat we SQL kunnen toevoegen):**

```bash
cd apps/api
npx prisma migrate dev --create-only --name help_trigram_search
```

Plak in het zojuist gegenereerde `prisma/migrations/<timestamp>_help_trigram_search/migration.sql`:

```sql
-- Typo-tolerante zoekfunctie op KB-artikelen
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_help_articles_title_trgm
  ON imp_help_articles USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_help_articles_excerpt_trgm
  ON imp_help_articles USING gin (excerpt gin_trgm_ops);

-- Snelle array-overlap (&&) op module_keys voor contextuele suggesties
CREATE INDEX IF NOT EXISTS idx_help_articles_module_keys
  ON imp_help_articles USING gin (module_keys);
```

Daarna toepassen:

```bash
npx prisma migrate dev
```

> Werkt de DB op een gedeelde/CI-omgeving zonder superuser-rechten? Dan kan `CREATE EXTENSION` falen. In dat geval de extensie eenmalig door een DBA laten activeren en de `CREATE EXTENSION`-regel uit de migratie halen.

---

## 7. Audit-registratie

`apps/api/src/common/audit/audited-entities.ts` — voeg drie entries toe aan de `AUDITED_ENTITIES`-array (de drift-test `audited-entities.spec.ts` controleert dat `table` exact gelijk is aan de `@@map`-waarde):

```ts
  // Helpsysteem
  { model: 'HelpCategory',  table: 'imp_help_categories', displayFields: ['name', 'slug'] },
  { model: 'HelpArticle',   table: 'imp_help_articles',   displayFields: ['title'] },
  {
    model: 'SupportTicket',
    table: 'imp_support_tickets',
    display: (r) => `#${r.ticketNumber ?? ''} ${r.subject ?? ''}`.trim() || r.id,
  },
```

`SupportAccessLog` heeft **geen** audit-entry nodig — het is zélf een expliciete log.

> Vergeet bij Fase 2/4 niet de NL-veldlabels in `apps/portal/src/lib/audit-field-labels.ts` (frontend) toe te voegen wanneer `<AuditHistory>` op de detailpagina's komt.

---

## 8. Seed

### 8.1 Cleanup-volgorde

Voeg deze `deleteMany`-aanroepen toe in het beheer-domein-blok van `prisma/seed.ts`, **vóór** `organization`/`user` (kinderen eerst):

```ts
// Helpsysteem (kinderen eerst; help* hebben FK's naar user én organization)
await prisma.supportTicketMessage.deleteMany();
await prisma.supportTicket.deleteMany();
await prisma.supportAccessLog.deleteMany();
await prisma.helpArticle.deleteMany();
await prisma.helpCategory.deleteMany();
```

### 8.2 Seed-data

Plaats dit blok ná het aanmaken van organisaties en users in `seed.ts`. Het zoekt de benodigde records zelf op (drop-in; pas alleen e-mails/slug aan als die in jouw seed afwijken).

```ts
// ─── Helpsysteem seed ──────────────────────────────────────────────────────
const demoOrg     = await prisma.organization.findUnique({ where: { slug: 'inspexidemo' } });
const superUser   = await prisma.user.findFirst({ where: { email: 'superuser@inspexi.nl' } });
const demoAdmin   = await prisma.user.findFirst({ where: { email: 'admin@inspexi-demo.nl' } });
const demoUser    = await prisma.user.findFirst({ where: { email: 'backoffice@inspexi-demo.nl' } });

// Globale KB-categorieën (org_id = null) + artikelen
const helpCategories = [
  { slug: 'aan-de-slag', name: 'Aan de slag',  icon: 'rocket',    order: 1, moduleKeys: ['dashboard', 'general'] },
  { slug: 'relaties',    name: 'Relaties',      icon: 'users',     order: 2, moduleKeys: ['contacts'] },
  { slug: 'offertes',    name: 'Offertes',      icon: 'file-text', order: 3, moduleKeys: ['quotes'] },
  { slug: 'aanvragen',   name: 'Aanvragen',     icon: 'inbox',     order: 4, moduleKeys: ['requests'] },
  { slug: 'planning',    name: 'Planning',      icon: 'calendar',  order: 5, moduleKeys: ['planning'] },
  { slug: 'inspecties',  name: 'Inspecties',    icon: 'clipboard', order: 6, moduleKeys: ['inspections'] },
];

for (const cat of helpCategories) {
  const category = await prisma.helpCategory.create({
    data: { orgId: null, slug: cat.slug, name: cat.name, icon: cat.icon, order: cat.order, isPublished: true },
  });

  // 2 voorbeeldartikelen per categorie
  for (let i = 1; i <= 2; i++) {
    await prisma.helpArticle.create({
      data: {
        orgId: null,
        categoryId: category.id,
        slug: `${cat.slug}-artikel-${i}`,
        title: `${cat.name}: voorbeeldartikel ${i}`,
        excerpt: `Korte uitleg over ${cat.name.toLowerCase()} (${i}).`,
        body: `# ${cat.name} ${i}\n\nDit is een voorbeeldartikel voor de knowledge base.\n\n1. Stap één\n2. Stap twee\n3. Stap drie`,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        moduleKeys: cat.moduleKeys,
        tags: [cat.slug],
        order: i,
        authorId: superUser?.id ?? null,
      },
    });
  }
}

// Eén org-specifiek artikel (alleen zichtbaar voor de demo-org)
if (demoOrg) {
  const offertesCat = await prisma.helpCategory.findFirst({ where: { orgId: null, slug: 'offertes' } });
  if (offertesCat) {
    await prisma.helpArticle.create({
      data: {
        orgId: demoOrg.id,
        categoryId: offertesCat.id,
        slug: 'interne-offerte-werkwijze',
        title: 'Interne werkwijze offertes (alleen InspeXi Demo)',
        excerpt: 'Org-specifieke afspraken rond offertes.',
        body: '# Interne werkwijze\n\nDit artikel is alleen zichtbaar binnen InspeXi Demo.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        moduleKeys: ['quotes'],
        tags: ['intern'],
        authorId: demoAdmin?.id ?? null,
      },
    });
  }
}

// Demo-tickets op de demo-org (verschillende statussen)
if (demoOrg && demoUser) {
  const demoTickets = [
    { n: 1, subject: 'Hoe maak ik een offerte op?', status: 'NIEUW',          priority: 'NORMAAL', category: 'VRAAG'    },
    { n: 2, subject: 'PDF-export lukt niet',         status: 'IN_BEHANDELING', priority: 'HOOG',    category: 'PROBLEEM' },
    { n: 3, subject: 'Verzoek: extra rapportveld',   status: 'OPGELOST',       priority: 'LAAG',    category: 'FEATURE_REQUEST' },
  ] as const;

  for (const t of demoTickets) {
    const ticket = await prisma.supportTicket.create({
      data: {
        orgId: demoOrg.id,
        ticketNumber: t.n,
        subject: t.subject,
        description: `Demo-ticket: ${t.subject}`,
        status: t.status,
        priority: t.priority,
        category: t.category,
        contextModule: 'quotes',
        createdById: demoUser.id,
        assignedToId: t.status === 'NIEUW' ? null : superUser?.id ?? null,
        lastMessageAt: new Date(),
        resolvedAt: t.status === 'OPGELOST' ? new Date() : null,
        messages: {
          create: [
            { orgId: demoOrg.id, authorId: demoUser.id, authorType: 'USER', body: `Vraag: ${t.subject}` },
            ...(t.status !== 'NIEUW'
              ? [{ orgId: demoOrg.id, authorId: superUser?.id ?? null, authorType: 'SUPPORT' as const, body: 'Bedankt voor je melding, we kijken ernaar.' }]
              : []),
          ],
        },
      },
    });
    void ticket;
  }
}

// Support-toegang: demo-org staat AAN met een log-spoor
if (demoOrg && demoAdmin) {
  await prisma.organization.update({
    where: { id: demoOrg.id },
    data: {
      supportAccessEnabled: true,
      supportAccessExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24u
    },
  });
  await prisma.supportAccessLog.create({
    data: {
      orgId: demoOrg.id,
      action: 'ENABLED',
      performedById: demoAdmin.id,
      performedByRole: 'ORG_ADMIN',
      ip: '127.0.0.1',
      note: 'Support-toegang geactiveerd (seed).',
    },
  });
}
```

---

## 9. Verificatie & Definition of Done

```bash
# vanuit repo-root
npx turbo run build            # TypeScript groen (schema-types + seed compileert)

cd apps/api
npx prisma migrate dev         # beide migraties toegepast, geen drift
pnpm db:seed                   # seed draait zonder FK-fouten
npx prisma studio              # imp_help_categories/articles, imp_support_tickets, imp_support_access_logs gevuld
pnpm test -- audited-entities  # drift-test groen (registry ↔ @@map)
```

**Klaar wanneer:**

- [ ] `migrate dev` maakt beide migraties aan; `pg_trgm` + GIN-indexen bestaan (`\d+ imp_help_articles` toont de indexen).
- [ ] `db:seed` vult globale + 1 org-specifiek artikel, 3 demo-tickets met threads, en een support-log-regel; demo-org `supportAccessEnabled = true`.
- [ ] `AUDITED_ENTITIES` bevat HelpCategory/HelpArticle/SupportTicket; drift-test groen.
- [ ] `npx turbo run build` groen.
- [ ] Geen `prisma db push` gebruikt; migraties herspelen schoon op een lege DB.

**Commit:** `feat: implement IMP_PRD-10 — fase 1 helpsysteem schema, migratie & seed`

> Volgende stap (Fase 2): `help`-module (NestJS) met zichtbaarheidsfilter + KB lees-UI + beheer. Zie `IMP_PRD_10_Helpsysteem.md` §6.1, §13.
