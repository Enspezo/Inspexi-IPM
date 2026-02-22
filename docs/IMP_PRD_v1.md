# Inspectie Management Platform — Product Requirements Document
**Module: Aanvragen & Offertes — MVP**
*Versie 1.0 | Februari 2026 | Vertrouwelijk — Intern gebruik*

---

## PRD Overzicht

| # | Module | Omschrijving |
|---|--------|-------------|
| PRD-01 | Fundament | Auth, multi-tenant, rollen, gebruikersbeheer |
| PRD-02 | CRM | Relaties, locaties, contactgeschiedenis |
| PRD-03 | Leads & Aanvragen | Lead management, statussen, workflow |
| PRD-04 | Producten & Prijstabellen | Catalogus, staffels, BTW, klantprijzen |
| PRD-05 | Offertes | Templates, editor, signing, webviewer |
| PRD-06 | Notificaties | In-platform, email, gebruikersvoorkeuren |

---

## PRD-01 — Fundament: Auth, Multi-Tenant & Gebruikersbeheer

### 1.1 Doel
De technische en functionele basis van het platform: authenticatie, autorisatie, multi-tenant architectuur en gebruikersbeheer. Alle overige modules bouwen hierop voort.

### 1.2 Tech Stack

| Onderdeel | Keuze |
|-----------|-------|
| Framework | NestJS (TypeScript) — nieuwe repo, zelfde PostgreSQL database als inspectie-backend |
| ORM | Prisma — gedeeld schema, eigen tabellen met prefix `imp_` |
| Auth | JWT access tokens (15 min) + refresh tokens (30 dagen, httpOnly cookie) |
| Email | Resend voor transactionele mails |
| PDF | Puppeteer voor offerte PDF generatie |
| Frontend | React + TypeScript + TailwindCSS |
| API stijl | REST met OpenAPI/Swagger documentatie |

### 1.3 Multi-Tenant Architectuur

Het platform werkt met volledig geïsoleerde organisaties (tenants). Elke organisatie heeft eigen data, eigen branding en eigen gebruikers. Organisaties kunnen geen data van andere organisaties zien.

| Concept | Beschrijving |
|---------|-------------|
| Organization | Een bedrijf/tenant dat het platform gebruikt. Heeft eigen slug, branding, gebruikers en data. |
| Superuser | Volledige toegang tot alle organisaties en systeeminstellingen. |
| Org Admin | Beheert de eigen organisatie: gebruikers, instellingen, templates, prijstabellen. |
| Manager | Kan offertes goedkeuren, heeft inzicht in alle aanvragen en offertes binnen de org. |
| Backoffice | Beheert relaties, aanvragen en maakt offertes op. |
| Werkvoorbereider | Verwerkt goedgekeurde offertes, plant inspecties in. |
| Inspecteur | Voert inspecties uit. Beperkte toegang — alleen eigen taken zichtbaar. |

### 1.4 Prisma Schema — Kern

Prefix `imp_` voorkomt conflicten met bestaande schema.

```prisma
model imp_organizations {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  logo_url      String?
  primary_color String?
  default_vat   Float    @default(21)
  default_validity_days Int @default(30)
  created_at    DateTime @default(now())
  users         imp_users[]
}

model imp_users {
  id                String    @id @default(uuid())
  org_id            String?   // nullable voor superuser
  email             String    @unique
  password_hash     String
  first_name        String
  last_name         String
  role              Role      // SUPERUSER | ORG_ADMIN | MANAGER | BACKOFFICE | WERKVOORBEREIDER | INSPECTEUR
  is_active         Boolean   @default(true)
  email_verified_at DateTime?
  created_at        DateTime  @default(now())
  organization      imp_organizations? @relation(fields: [org_id], references: [id])
}

model imp_refresh_tokens {
  id         String    @id @default(uuid())
  user_id    String
  token_hash String
  expires_at DateTime
  revoked_at DateTime?
}

model imp_invitations {
  id          String    @id @default(uuid())
  org_id      String
  email       String
  role        Role
  token       String    @unique
  expires_at  DateTime
  accepted_at DateTime?
  created_at  DateTime  @default(now())
}

enum Role {
  SUPERUSER
  ORG_ADMIN
  MANAGER
  BACKOFFICE
  WERKVOORBEREIDER
  INSPECTEUR
}
```

### 1.5 Rollen & Rechten Matrix

| Actie | Superuser | Org Admin | Manager | Backoffice | Werkvoorbereider | Inspecteur |
|-------|-----------|-----------|---------|------------|------------------|------------|
| Org aanmaken | ✓ | — | — | — | — | — |
| Gebruikers beheren | ✓ | ✓ | — | — | — | — |
| Relaties beheren | ✓ | ✓ | ✓ | ✓ | — | — |
| Aanvragen beheren | ✓ | ✓ | ✓ | ✓ | — | — |
| Offertes maken | ✓ | ✓ | ✓ | ✓ | — | — |
| Offertes goedkeuren | ✓ | ✓ | ✓ | — | — | — |
| Templates beheren | ✓ | ✓ | — | — | — | — |
| Prijstabellen beheren | ✓ | ✓ | — | — | — | — |
| Eigen taken zien | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 1.6 API Endpoints — Auth

| Method | Endpoint | Beschrijving | Auth |
|--------|----------|-------------|------|
| POST | /auth/login | Email + wachtwoord, retourneert access token + refresh cookie | Nee |
| POST | /auth/refresh | Vernieuw access token via refresh cookie | Cookie |
| POST | /auth/logout | Revoke refresh token | Ja |
| POST | /auth/forgot-password | Stuur reset email via Resend | Nee |
| POST | /auth/reset-password | Reset wachtwoord met token | Nee |
| GET | /auth/me | Huidig ingelogde gebruiker + org info | Ja |
| POST | /auth/verify-email | Bevestig email via token | Nee |

### 1.7 Gebruikersbeheer Features

- Gebruiker uitnodigen — email + rol selecteren, invite mail via Resend (expires 7 dagen)
- Gebruiker deactiveren — soft delete, kan niet meer inloggen maar data blijft
- Rol wijzigen — door Org Admin of Superuser
- Wachtwoord reset — via email flow
- Eigen profiel bewerken — naam, email, profielfoto, notificatievoorkeuren
- Sessies beheren — actieve sessies inzien en uitloggen

### 1.8 Organisatie Instellingen (configureerbaar per org)

- Naam, logo, primaire kleur (voor offerte branding)
- Standaard BTW percentage (default 21%)
- Standaard offerte geldigheid in dagen (default 30)
- Afzender naam en email voor Resend
- Tijdzone en taalinstelling (NL voor MVP)

---

## PRD-02 — CRM: Relaties, Locaties & Contactgeschiedenis

### 2.1 Doel

Het CRM is de kern van alle klantgerelateerde data. Relaties (bedrijven of particulieren) hebben locaties/objecten en een volledige contactgeschiedenis. Vanuit een relatie zijn alle gekoppelde aanvragen en offertes direct inzichtelijk.

### 2.2 Prisma Schema

```prisma
model imp_contacts {
  id             String      @id @default(uuid())
  org_id         String
  type           ContactType // COMPANY | INDIVIDUAL
  company_name   String?
  first_name     String?
  last_name      String?
  email          String?
  phone          String?
  website        String?
  vat_number     String?
  coc_number     String?
  notes          String?
  price_table_id String?     // FK naar imp_price_tables
  created_at     DateTime    @default(now())
  addresses      imp_contact_addresses[]
  locations      imp_locations[]
  logs           imp_contact_logs[]
  emails         imp_contact_emails[]
}

model imp_contact_addresses {
  id           String  @id @default(uuid())
  contact_id   String
  label        String  // factuur | bezoek | etc
  street       String
  house_number String
  postal_code  String
  city         String
  country      String  @default("NL")
  is_primary   Boolean @default(false)
}

model imp_locations {
  id          String   @id @default(uuid())
  contact_id  String
  org_id      String
  name        String
  street      String
  house_number String
  postal_code String
  city        String
  object_type String?  // woning | kantoor | industrieel | etc
  notes       String?
  created_at  DateTime @default(now())
}

model imp_contact_logs {
  id         String      @id @default(uuid())
  contact_id String
  org_id     String
  user_id    String
  type       LogType     // EMAIL | PHONE | MEETING | NOTE
  subject    String?
  body       String?
  logged_at  DateTime    @default(now())
  created_at DateTime    @default(now())
}

model imp_contact_emails {
  id         String    @id @default(uuid())
  contact_id String
  org_id     String
  user_id    String
  resend_id  String?
  subject    String
  body_html  String
  sent_at    DateTime  @default(now())
  opened_at  DateTime?
}

enum ContactType { COMPANY INDIVIDUAL }
enum LogType { EMAIL PHONE MEETING NOTE }
```

### 2.3 Functionele Vereisten

**Relaties aanmaken & bewerken:**
- Type selectie: Bedrijf (standaard) of Particulier
- Bedrijf: bedrijfsnaam, KvK-nummer, BTW-nummer, website, contactpersoon
- Particulier: voor- en achternaam, geboortedatum (optioneel)
- Meerdere adressen per relatie met label, primair adres markeren
- Vrij notitieveld + gekoppelde prijstabel

**Locaties / Objecten:**
- Meerdere locaties/panden per relatie (bijv. vastgoedbeheerder met 20 panden)
- Naam, adres, objecttype (woning, kantoor, industrieel, etc.)
- Koppelbaar aan offertes en inspecties

**Contactgeschiedenis:**
- Handmatig loggen: telefoongesprek, meeting, notitie
- Automatisch gelogd: verstuurde emails, gecreëerde aanvragen, geaccepteerde offertes
- Email versturen vanuit platform via Resend, met open-tracking
- Zoeken en filteren op type en datum

### 2.4 API Endpoints — CRM

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | /contacts | Lijst relaties (paginering, zoeken, filter op type) |
| POST | /contacts | Nieuwe relatie aanmaken |
| GET | /contacts/:id | Relatie detail incl. adressen, locaties, logs, offertes |
| PATCH | /contacts/:id | Relatie bijwerken |
| DELETE | /contacts/:id | Soft delete |
| POST | /contacts/:id/addresses | Adres toevoegen |
| POST | /contacts/:id/locations | Locatie/object toevoegen |
| GET | /contacts/:id/locations | Locaties van relatie |
| POST | /contacts/:id/logs | Contactmoment handmatig loggen |
| GET | /contacts/:id/logs | Contactgeschiedenis ophalen |
| POST | /contacts/:id/email | Email sturen via Resend |

### 2.5 Portal UI Schermen

- **Relatieoverzicht** — tabel met zoekbalk, filters (type, prijstabel, datum)
- **Relatie aanmaken/bewerken** — formulier met tabbladen: Algemeen | Adressen | Locaties
- **Relatiekaart** — volledig overzicht: info, locaties, contactgeschiedenis, aanvragen & offertes
- **Email opstellen** — editor met onderwerp, body, bijlagen
- **Contactmoment loggen** — type, datum, onderwerp, notitie

---

## PRD-03 — Leads & Aanvragen

### 3.1 Doel

Aanvragen zijn de instappunten van nieuwe opdrachten. Voor de MVP worden aanvragen handmatig aangemaakt. Een aanvraag is altijd gekoppeld aan een relatie en stroomt door naar een offerte.

### 3.2 Prisma Schema

```prisma
model imp_requests {
  id           String        @id @default(uuid())
  org_id       String
  contact_id   String
  location_id  String?
  assigned_to  String?       // user_id
  source       RequestSource // MANUAL | WEB_FORM | EMAIL | PHONE
  status       RequestStatus
  title        String
  description  String?
  priority     Priority      // LOW | NORMAL | HIGH
  created_by   String
  created_at   DateTime      @default(now())
  updated_at   DateTime      @updatedAt
  status_history imp_request_status_history[]
}

model imp_request_status_history {
  id          String        @id @default(uuid())
  request_id  String
  from_status RequestStatus?
  to_status   RequestStatus
  changed_by  String
  changed_at  DateTime      @default(now())
  note        String?
}

enum RequestSource { MANUAL WEB_FORM EMAIL PHONE }
enum RequestStatus { NIEUW IN_BEHANDELING OFFERTE_GEMAAKT GEWONNEN VERLOREN ON_HOLD }
enum Priority { LOW NORMAL HIGH }
```

### 3.3 Aanvraag Statussen

| Status | Betekenis | Volgende stap |
|--------|-----------|--------------|
| NIEUW | Aanvraag net aangemaakt | In behandeling nemen |
| IN_BEHANDELING | Medewerker is ermee bezig | Offerte opmaken of afwijzen |
| OFFERTE_GEMAAKT | Offerte aangemaakt | Wachten op klant of goedkeuring |
| GEWONNEN | Offerte geaccepteerd | Doorsturen naar werkvoorbereiding |
| VERLOREN | Afgewezen of ingetrokken | Archief |
| ON_HOLD | Tijdelijk geparkeerd | Hervatten |

### 3.4 Functionele Vereisten

**Aanmaken:**
- Relatie selecteren of nieuw aanmaken tijdens invullen
- Locatie/object koppelen (optioneel, uit bestaande locaties relatie)
- Titel, omschrijving, bron, prioriteit
- Toewijzen aan medewerker

**Beheer & Overzicht:**
- Kanban-bord én lijstweergave
- Filteren op status, medewerker, prioriteit, datum
- Zoeken op naam, relatie, omschrijving
- Statuswijziging met optionele notitie (gelogd in history)
- Vanuit aanvraag direct een offerte aanmaken (relatie + locatie meegenomen)

### 3.5 API Endpoints — Aanvragen

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | /requests | Lijst aanvragen (paginering, filters) |
| POST | /requests | Nieuwe aanvraag |
| GET | /requests/:id | Detail incl. statushistorie |
| PATCH | /requests/:id | Bijwerken |
| PATCH | /requests/:id/status | Status wijzigen (met note) |
| POST | /requests/:id/quote | Offerte aanmaken vanuit aanvraag |
| DELETE | /requests/:id | Soft delete |

---

## PRD-04 — Producten & Prijstabellen

### 4.1 Doel

Productcatalogus met alle diensten/producten. Prijstabellen bepalen welke tarieven een klant krijgt. Ondersteunt vaste prijzen, staffelprijzen op aantallen en klantspecifieke tabellen (bijv. VIP).

### 4.2 Prisma Schema

```prisma
model imp_products {
  id          String   @id @default(uuid())
  org_id      String
  name        String
  description String?
  unit        String   // stuks | uur | m2 | m | dag | traject | custom
  default_vat Float    @default(21)
  category    String?
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now())
}

model imp_price_tables {
  id          String   @id @default(uuid())
  org_id      String
  name        String
  description String?
  is_default  Boolean  @default(false)
  created_at  DateTime @default(now())
  items       imp_price_table_items[]
}

model imp_price_table_items {
  id             String    @id @default(uuid())
  price_table_id String
  product_id     String
  price_type     PriceType // FIXED | TIERED
  base_price     Float?    // voor FIXED
  created_at     DateTime  @default(now())
  tiers          imp_price_tiers[]
}

model imp_price_tiers {
  id                  String  @id @default(uuid())
  price_table_item_id String
  from_qty            Float
  to_qty              Float?  // null = onbeperkt
  price               Float
}

// Koppeltabel: klant aan prijstabel
model imp_contact_price_tables {
  contact_id     String
  price_table_id String
  @@id([contact_id, price_table_id])
}

enum PriceType { FIXED TIERED }
```

### 4.3 Prijstypen

- **FIXED** — vaste prijs per eenheid (bijv. NEN1010 inspectie: €85/uur)
- **TIERED** — staffelprijs op basis van hoeveelheid (1-10 = €50, 11-50 = €40, 51+ = €35)
- **Klantspecifiek** — aparte prijstabel per klant of klantsegment (VIP = lagere tarieven op alle producten)

**Voorbeeld VIP prijstabel:**
| Product | Standaard | VIP |
|---------|-----------|-----|
| NEN1010 Inspectie | €85,00/uur | €75,00/uur |
| Rapportage opstellen | €55,00/uur | €45,00/uur |
| Reiskosten | €0,25/km | €0,00 |

### 4.4 Gedrag in offerte-editor

- Prijs automatisch geladen vanuit prijstabel van de klant
- Medewerker kan prijs altijd handmatig overschrijven per offerteregel
- Staffels berekend op basis van ingevulde hoeveelheid

### 4.5 API Endpoints — Producten & Prijstabellen

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | /products | Catalogus (filter actief, categorie) |
| POST | /products | Nieuw product |
| PATCH | /products/:id | Product bijwerken |
| GET | /price-tables | Alle prijstabellen van de org |
| POST | /price-tables | Nieuwe prijstabel |
| GET | /price-tables/:id | Detail incl. items en tiers |
| PUT | /price-tables/:id/items | Producten en prijzen instellen |
| POST | /price-tables/:id/assign/:contactId | Tabel aan relatie koppelen |
| GET | /price-tables/for-contact/:contactId | Prijstabel voor klant ophalen |

---

## PRD-05 — Offertes: Templates, Editor, Signing & Webviewer

### 5.1 Doel

Het offertemodule is het hart van de aanvraagworkflow. Medewerkers maken professionele offertes op basis van templates. De klant ontvangt een unieke weblink, kan vragen stellen en tekent digitaal. Een optionele interne goedkeuringsflow zorgt voor kwaliteitscontrole.

### 5.2 Prisma Schema

```prisma
model imp_quote_templates {
  id                   String   @id @default(uuid())
  org_id               String
  name                 String
  cover_blocks         Json     // array van inhoudsblokken
  content_blocks       Json
  closing_blocks       Json
  default_attachments  Json     // array van file keys
  default_validity_days Int     @default(30)
  requires_approval    Boolean  @default(false)
  created_at           DateTime @default(now())
}

model imp_quotes {
  id                  String      @id @default(uuid())
  org_id              String
  contact_id          String
  location_id         String?
  request_id          String?
  template_id         String?
  quote_number        String      @unique // OFF-2026-0042
  status              QuoteStatus
  title               String
  cover_blocks        Json
  content_blocks      Json
  closing_blocks      Json
  notes_internal      String?
  price_table_id      String?
  subtotal            Float       @default(0)
  vat_total           Float       @default(0)
  total               Float       @default(0)
  validity_date       DateTime?
  requires_approval   Boolean     @default(false)
  approved_by         String?
  approved_at         DateTime?
  sent_at             DateTime?
  viewed_at           DateTime?
  signed_at           DateTime?
  client_name         String?
  client_signature    String?     // base64 PNG
  client_ip           String?
  client_user_agent   String?
  manager_signed_at   DateTime?
  manager_signature   String?
  public_token        String      @unique @default(uuid())
  created_by          String
  created_at          DateTime    @default(now())
  updated_at          DateTime    @updatedAt
  lines               imp_quote_lines[]
  questions           imp_quote_questions[]
  attachments         imp_quote_attachments[]
  approval_requests   imp_quote_approval_requests[]
}

model imp_quote_lines {
  id          String   @id @default(uuid())
  quote_id    String
  product_id  String?
  description String
  quantity    Float
  unit        String
  unit_price  Float
  vat_rate    Float    @default(21)
  discount_pct Float   @default(0)
  line_total  Float
  sort_order  Int
}

model imp_quote_questions {
  id             String   @id @default(uuid())
  quote_id       String
  user_id        String?  // null = klant
  message        String
  is_from_client Boolean  @default(false)
  created_at     DateTime @default(now())
}

model imp_quote_attachments {
  id          String  @id @default(uuid())
  quote_id    String
  file_key    String
  file_name   String
  file_size   Int
  is_standard Boolean @default(false)
  sort_order  Int
}

model imp_quote_approval_requests {
  id           String         @id @default(uuid())
  quote_id     String
  requested_by String
  assigned_to  String         // manager user_id
  status       ApprovalStatus // PENDING | APPROVED | REJECTED
  note         String?
  responded_at DateTime?
  created_at   DateTime       @default(now())
}

enum QuoteStatus {
  CONCEPT
  TER_GOEDKEURING
  GOEDGEKEURD
  VERSTUURD
  BEKEKEN
  GEACCEPTEERD
  AFGEWEZEN
  VERLOPEN
}

enum ApprovalStatus { PENDING APPROVED REJECTED }
```

### 5.3 Offerte Statussen

| Status | Betekenis |
|--------|-----------|
| CONCEPT | Wordt opgesteld, niet verstuurd |
| TER_GOEDKEURING | Wacht op goedkeuring manager |
| GOEDGEKEURD | Intern goedgekeurd, klaar om te versturen |
| VERSTUURD | Email naar klant verstuurd |
| BEKEKEN | Klant heeft offerte voor het eerst geopend |
| GEACCEPTEERD | Klant heeft digitaal ondertekend |
| AFGEWEZEN | Klant of medewerker heeft afgewezen |
| VERLOPEN | Geldigheid verstreken zonder reactie |

### 5.4 Template Structuur

Een template bestaat uit vier secties met configureerbare inhoudsblokken:

1. **Voorblad (Cover)** — bedrijfsbranding, titel, klantgegevens, datum
2. **Inhoudsblokken** — vrije tekst/HTML secties met placeholders
3. **Prijstabel** — automatisch gegenereerd op basis van offerteregels
4. **Afsluitende blokken** — voorwaarden, ondertekeningsveld, contactinfo

Standaardbijlagen worden automatisch meegestuurd (bijv. algemene voorwaarden PDF).

### 5.5 Beschikbare Placeholders

| Placeholder | Vervangen door |
|-------------|---------------|
| `{{klant_naam}}` | Bedrijfsnaam of voor- + achternaam |
| `{{klant_adres}}` | Primair adres van de relatie |
| `{{inspectie_adres}}` | Gekoppelde locatie/object adres |
| `{{offerte_nummer}}` | Gegenereerd nummer (bijv. OFF-2026-0042) |
| `{{offerte_datum}}` | Datum van aanmaken |
| `{{geldig_tot}}` | Verloopdatum |
| `{{medewerker_naam}}` | Naam van de maker |
| `{{organisatie_naam}}` | Naam van de organisatie |
| `{{organisatie_logo}}` | Logo als afbeelding |

### 5.6 Offerte Editor — 5 Stappen

**Stap 1 — Basisgegevens:**
- Relatie selecteren, locatie koppelen, template kiezen
- Titel, geldigheid, interne notitie

**Stap 2 — Inhoudsblokken:**
- Tekst bewerken, placeholders invoegen via dropdown

**Stap 3 — Prijstabel:**
- Producten/diensten toevoegen uit catalogus
- Vrije regels toevoegen (zonder product)
- Hoeveelheid en eenheid instellen
- Prijs auto-filled vanuit klantprijstabel — handmatig overschrijfbaar
- Korting per regel (% of absoluut), BTW per regel overschrijfbaar
- Subtotalen per sectie (optioneel), totaal excl. BTW, BTW, totaal incl. BTW
- Sorteervolgorde via drag & drop

**Stap 4 — Bijlagen:**
- Standaardbijlagen (aangevinkt vanuit template)
- Extra bijlagen uploaden per offerte

**Stap 5 — Review & Verzenden:**
- Preview van de complete offerte
- Keuze: opslaan als concept / ter goedkeuring indienen / direct versturen

### 5.7 Interne Goedkeuringsflow

Per template en per individuele offerte configureerbaar of goedkeuring verplicht is.

1. Backoffice dient offerte in ter goedkeuring
2. Manager ontvangt notificatie (in-platform + email)
3. Manager bekijkt offerte, alle details en prijzen
4. Manager **keurt goed** (optionele digitale handtekening) of **wijst af** (verplichte notitie)
5. Bij goedkeuring → status GOEDGEKEURD, backoffice ontvangt notificatie
6. Bij afwijzing → status terug naar CONCEPT, backoffice ontvangt notitie met reden

### 5.8 Versturen & Publieke Webviewer

**Versturen:**
- Email via Resend met gepersonaliseerde tekst
- Unieke publieke link: `platform.nl/offerte/{public_token}`
- Open-tracking: eerste keer openen registreert `viewed_at` en triggert notificatie
- CC-adressen toevoegen bij versturen

**Webviewer (klantportaal — geen login vereist):**
- Volledig opgemaakte offerte in de browser met organisatiebranding
- Voorblad, inhoudsblokken, prijstabel, afsluiting
- Q&A sectie: klant stelt vragen, medewerker antwoordt vanuit platform
- PDF download knop (Puppeteer gegenereerd)
- Bijlagen als losse downloads
- Digitaal ondertekenen

### 5.9 Digitale Ondertekening (eigen flow)

- Klant vult naam en functietitel in
- Klant tekent op canvas (muis/touch) — type-gebaseerde handtekening als fallback
- IP-adres, timestamp en user agent opgeslagen als audit trail
- Handtekening opgeslagen als base64 PNG
- Status → GEACCEPTEERD
- Getekende PDF gegenereerd met handtekening en auditblok op laatste pagina
- Verantwoordelijke medewerker + usergroup ontvangen notificatie

### 5.10 Q&A

- Klant stelt vraag via webviewer (geen login)
- Medewerker ontvangt notificatie in platform én per email
- Medewerker antwoordt vanuit platform
- Klant ontvangt email-notificatie bij nieuw antwoord
- Volledige Q&A-thread bewaard bij de offerte

### 5.11 PDF Generatie (Puppeteer)

- Puppeteer rendert webviewer HTML naar PDF (A4)
- Header met paginanummering en organisatielogo
- Voorblad + inhoudsblokken + prijstabel + afsluiting in één PDF
- Bijlagen: apart beschikbaar als losse downloads (niet samengevoegd)
- Getekende versie: handtekening + auditblok toegevoegd op laatste pagina
- PDF opgeslagen in S3-compatibele object storage (Supabase Storage of Cloudflare R2)

### 5.12 API Endpoints — Offertes

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | /quotes | Lijst offertes (filters op status, relatie, datum) |
| POST | /quotes | Nieuwe offerte aanmaken |
| GET | /quotes/:id | Detail incl. regels, bijlagen, Q&A |
| PATCH | /quotes/:id | Bijwerken (alleen CONCEPT) |
| POST | /quotes/:id/submit-approval | Ter goedkeuring indienen |
| POST | /quotes/:id/approve | Goedkeuren (manager + optionele signing) |
| POST | /quotes/:id/reject | Afwijzen met verplichte notitie |
| POST | /quotes/:id/send | Versturen naar klant via Resend |
| GET | /quotes/:id/pdf | PDF genereren/ophalen |
| POST | /quotes/:id/questions | Vraag stellen (medewerker) |
| GET | /public/quotes/:token | Publieke webviewer (geen auth) |
| POST | /public/quotes/:token/questions | Klant stelt vraag (geen auth) |
| POST | /public/quotes/:token/sign | Klant ondertekent (geen auth) |
| GET | /public/quotes/:token/pdf | PDF downloaden (publiek) |
| GET | /quote-templates | Templates ophalen |
| POST | /quote-templates | Template aanmaken |
| PATCH | /quote-templates/:id | Template bewerken |

---

## PRD-06 — Notificaties: In-Platform & Email

### 6.1 Doel

Gebruikers worden proactief op de hoogte gehouden van relevante events. Elke gebruiker bepaalt zelf per notificatietype of zij in-platform, per email of helemaal geen notificaties willen ontvangen.

### 6.2 Prisma Schema

```prisma
model imp_notifications {
  id          String           @id @default(uuid())
  org_id      String
  user_id     String
  type        NotificationType
  title       String
  body        String
  entity_type String?          // quote | request | contact
  entity_id   String?
  is_read     Boolean          @default(false)
  read_at     DateTime?
  created_at  DateTime         @default(now())
}

model imp_notification_prefs {
  id                String           @id @default(uuid())
  user_id           String
  notification_type NotificationType
  channel_in_app    Boolean          @default(true)
  channel_email     Boolean          @default(true)
  @@unique([user_id, notification_type])
}

model imp_notification_group_prefs {
  id                String           @id @default(uuid())
  org_id            String
  role              Role
  notification_type NotificationType
  channel_in_app    Boolean          @default(true)
  channel_email     Boolean          @default(true)
  @@unique([org_id, role, notification_type])
}

enum NotificationType {
  OFFERTE_TER_GOEDKEURING
  OFFERTE_GOEDGEKEURD
  OFFERTE_AFGEWEZEN
  OFFERTE_VERSTUURD
  OFFERTE_BEKEKEN
  OFFERTE_ONDERTEKEND
  OFFERTE_VERLOPEN
  NIEUWE_VRAAG_KLANT
  ANTWOORD_OP_VRAAG
  AANVRAAG_TOEGEWEZEN
  AANVRAAG_STATUS_GEWIJZIGD
}
```

### 6.3 Notificatietypes & Triggers

| Type | Trigger | Standaard ontvangers |
|------|---------|---------------------|
| OFFERTE_TER_GOEDKEURING | Offerte ingediend ter goedkeuring | Managers |
| OFFERTE_GOEDGEKEURD | Manager keurt goed | Maker van offerte |
| OFFERTE_AFGEWEZEN | Manager wijst af | Maker van offerte |
| OFFERTE_VERSTUURD | Offerte verstuurd naar klant | Maker van offerte |
| OFFERTE_BEKEKEN | Klant opent offerte voor eerste keer | Maker van offerte |
| OFFERTE_ONDERTEKEND | Klant ondertekent | Maker + verantwoordelijke usergroup |
| OFFERTE_VERLOPEN | Geldigheid verstreken | Maker van offerte |
| NIEUWE_VRAAG_KLANT | Klant stelt vraag via webviewer | Maker van offerte |
| ANTWOORD_OP_VRAAG | Medewerker beantwoordt vraag | Klant (via email) |
| AANVRAAG_TOEGEWEZEN | Aanvraag toegewezen | Betreffende medewerker |
| AANVRAAG_STATUS_GEWIJZIGD | Status aanvraag veranderd | Toegewezen medewerker |

### 6.4 In-Platform (Bell notificaties)

- Bell icoon in navigatiebalk met badge (aantal ongelezen)
- Dropdown met laatste 10 notificaties — klikbaar, navigeert naar item
- Notificatiepagina met volledig overzicht en filters
- Alles als gelezen markeren
- Realtime updates via polling elke 30 seconden (MVP)

### 6.5 Email (via Resend)

- Opgemaakte HTML email met organisatiebranding
- Directe link naar het item in het platform
- Afmeldlink voor dat notificatietype in de email footer
- Directe email bij hoge prioriteit events (signing, goedkeuring)

### 6.6 Gebruikersvoorkeuren

Per notificatietype kiest de gebruiker in profielinstellingen:
- In-platform: aan/uit
- Email: aan/uit
- Beide uit = geen notificatie voor dat type

Org Admin stelt standaarden in per rol. Nieuwe gebruikers erven groepsinstellingen en kunnen daarna individueel afwijken.

### 6.7 API Endpoints — Notificaties

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | /notifications | Eigen notificaties (paginering, filter) |
| PATCH | /notifications/:id/read | Markeer als gelezen |
| POST | /notifications/read-all | Alles als gelezen |
| GET | /notifications/unread-count | Aantal ongelezen (voor bell badge) |
| GET | /notification-prefs | Eigen voorkeuren |
| PUT | /notification-prefs | Voorkeuren opslaan |
| GET | /notification-prefs/group | Groepsstandaard (org admin) |
| PUT | /notification-prefs/group | Groepsstandaard instellen |

---

## Implementatie — Bouwvolgorde & Claude Code Instructies

### Aanbevolen Fasering

| Fase | PRD | Afhankelijkheden | Complexiteit |
|------|-----|-----------------|-------------|
| 1 | PRD-01 Fundament | Geen — start hier | Medium |
| 2 | PRD-02 CRM | PRD-01 | Medium |
| 3 | PRD-04 Producten & Prijzen | PRD-01 | Medium |
| 4 | PRD-03 Aanvragen | PRD-01, PRD-02 | Laag-Medium |
| 5 | PRD-05 Offertes | PRD-01 t/m PRD-04 | Hoog |
| 6 | PRD-06 Notificaties | PRD-01, PRD-05 | Medium |

### Claude Code Sessie Instructies

Start elke sessie met: *"Lees PRD-0X en implementeer de NestJS API + Prisma schema + React portal UI voor deze module."*

- Prisma schema altijd eerst — `prisma migrate dev` uitvoeren voor API code
- API eerst, dan Portal UI
- Jest voor unit tests op service-laag, Supertest voor API-integratie tests
- Swagger decorators op alle endpoints (`@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`)
- Elke module als NestJS Module: `/src/modules/[module-naam]/`
- Guards: `JwtAuthGuard` + `RolesGuard` op alle beveiligde routes
- Seed data aanmaken voor development

### Folder Structuur

```
apps/
  api/                        # NestJS backend
    src/
      modules/
        auth/                 # PRD-01
        organizations/        # PRD-01
        users/                # PRD-01
        contacts/             # PRD-02
        requests/             # PRD-03
        products/             # PRD-04
        price-tables/         # PRD-04
        quotes/               # PRD-05
        notifications/        # PRD-06
      prisma/                 # schema.prisma + migrations/
      common/                 # guards, decorators, filters, pipes
  portal/                     # React frontend (Vite + TypeScript)
    src/
      pages/                  # één folder per module
      components/             # gedeelde UI componenten
      hooks/                  # custom React hooks
      api/                    # API client functies
```

### Environment Variables (.env)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@jouwdomein.nl
PUBLIC_URL=https://platform.nl
STORAGE_ENDPOINT=...
STORAGE_BUCKET=...
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
```

---

*Inspectie Management Platform — PRD v1.0 — Vertrouwelijk*
