# IMP PRD-08 — Facturatie & Boekhouding (verkoop- + inkoopfacturen)

> Status: **Concept / plan van aanpak** · Auteur: Claude (o.b.v. studie WeFact-account *InspectieDienst Nederland B.V.* + codebase-analyse) · Datum: juni 2026
>
> Taal: PRD in het Nederlands; alle technische identifiers (modellen, velden, modules, branches) in het Engels — conform `CLAUDE.md`.

---

## 1. Samenvatting

We bouwen een eigen **facturatie- en lichte boekhoudmodule** in InspeXi-Beheer, zodat een inspectiebedrijf zijn volledige geld-administratie centraal beheert naast leads, offertes, planning en inspecties. De module dekt **verkoopfacturen** (debiteuren) en **inkoopfacturen** (crediteuren), met het volledige betalingstraject (concept → verstuurd → (deels) betaald, herinneringen, aanmaningen, creditfacturen) en een **BTW-overzicht** voor de accountant.

Het ontwerp **spiegelt het bestaande Quote-domein** (zelfde patronen voor nummering, regels, BTW, PDF-generatie, klantportaal, notificaties, audit-trail), zodat we maximaal hergebruiken en de leercurve minimaal is. Belangrijkste strategische winst t.o.v. WeFact: de factuur is **hard gekoppeld** aan offerte → project → inspectieplan, waardoor we kunnen **automatisch factureren bij oplevering** en **meerwerk uit het veld** automatisch op de factuur krijgen.

### Vastgestelde uitgangspunten (uit overleg)

| Beslissing | Keuze |
|---|---|
| Positionering t.o.v. WeFact | **WeFact vervangen** — InspeXi wordt leidend voor verkoop- én inkoopfacturen |
| Boekhoudkundige diepgang | **Facturatie + debiteuren/crediteuren + BTW-overzicht** — géén grootboek/journaalposten |
| Online betalen (iDEAL/betaallink) | **Later**, samen met de bankkoppeling — betaalmodel nu al in het schema, activering later |
| Extra scope | **Peppol/UBL e-facturatie**, **inkoopfactuur scan/OCR + mail-inbox**, **periodieke/herhaalfacturen** |
| Niet (nu) in scope | Volledige dubbele boekhouding, BTW-aangifte indienen, bankkoppeling/afletteren, data-migratie WeFact (zie §10) |

---

## 2. Doel & scope

### 2.1 In scope

- **Verkoopfacturen**: aanmaken (handmatig + vanuit geaccepteerde offerte + vanuit werkbon/inspectie), conceptfase, versturen per e-mail, PDF, klantportaal-inzage, betaalstatus, deelbetalingen.
- **Creditfacturen**: volledig en gedeeltelijk crediteren, gekoppeld aan de originele factuur.
- **Deelfacturen / in delen factureren**: termijnfacturatie (bv. 50% bij opdracht, 50% na oplevering).
- **Betalingstraject**: betaaltermijnen, herinneringen (configureerbaar aantal), aanmaningen, automatisch of handmatig versturen, betalingstraject pauzeren.
- **Inkoopfacturen (crediteuren)**: leveranciers, handmatige invoer, upload (drag & drop), **doorstuur-e-mailadres** + **OCR-herkenning**, queues *te verwerken → te betalen → betaald*, betaaloverzicht.
- **Periodieke/herhaalfacturen (abonnementen)**: terugkerende facturen op interval (maand/kwartaal/jaar), gekoppeld aan (her)inspectiecyclus.
- **BTW-overzicht & export**: BTW per periode/tarief, debiteuren/crediteuren-overzicht (aging), export voor de accountant (UBL, CSV/Excel, en als optie XAF auditfile).
- **Peppol/UBL e-facturatie**: facturen als UBL 2.1 versturen + via het Peppol-netwerk.
- **Instellingen**: betaaltermijnen, nummering, BTW-tarieven, herinnerings-/aanmaningsschema, huisstijl/factuursjabloon.

### 2.2 Out of scope (nu)

- Grootboek, journaalposten, balans/W&V, BTW-aangifte indienen bij de Belastingdienst.
- Bankkoppeling (PSD2/CAMT), automatisch afletteren — **wel** voorbereid in het datamodel.
- Online betaalprovider (Mollie/iDEAL betaallink) — **wel** voorbereid in het datamodel, activering in een latere fase.
- Loonadministratie, urenregistratie-facturatie buiten inspectiewerk.

### 2.3 Niet-functionele eisen

- **Multi-tenant**: alle entiteiten `orgId`-scoped, conform `TenantGuard` + `orgScope(user)`.
- **Fiscale onwijzigbaarheid**: een **verstuurde** factuur is onwijzigbaar (geen edit), correctie alléén via creditfactuur. Doorlopende, gat-loze nummering per administratie (wettelijke eis).
- **Audit-trail**: alle factuur-entiteiten in `AUDITED_MODELS` (automatisch via Prisma `$use`).
- **Bewaarplicht**: documenten/PDF's via `StorageProvider`, 7 jaar bewaartermijn als uitgangspunt.

---

## 3. Onderzoek WeFact — kernbevindingen

Bestudeerd in het live-account *InspectieDienst Nederland B.V.* + `wefact.nl/help`. Samenvatting van wat we overnemen en wat beter kan.

### 3.1 Verkoopfactuur-lifecycle

- **Statussen**: `Concept`, `Concept (geblokkeerd)`, `Concept (ingepland)`, `Verzonden` (display: *Wacht op betaling*), `Deels betaald`, `Betaald` (display: *Voldaan + datum*), `Creditfactuur`, `Vervallen`, `Gepauzeerd`. Afgeleide weergaven: *1e herinnering versturen*, *aanmaning te sturen*.
- **Conceptnummering apart van definitief**: concept = `[concept]0028`, na versturen pas een definitief gatloos nummer `F202600201`. Cruciaal voor fiscale gatloze reeks.
- **Factuurregels**: datum (per regel!), aantal, productnr., omschrijving (meerregelig), BTW%, prijs p/e, regeltotaal. Plus **tekstregels** (0% / €0, bv. *betalingscondities*) en **kortingsregels** per regel (`10% korting op offerteregel`).
- **Factuurkenmerken**: factuurnummer, klantnummer, datum, **referentie** (vrij veld, gebruikt voor offertenr. `OF…`), automatisch incasso (ja/nee), online betaallink, **eigen velden** (Project, Relatiemanager, Eigenaar).
- **Betaal-tracking**: *1x verzonden / 0x herinnering / 0x aanmaning*, uiterste betaaldatum (bv. 14 dagen), **historie-log** (aangemaakt / bewerkt / per e-mail verzonden / geaccepteerd met IP).
- **Acties**: Versturen per e-mail, Downloaden, Markeren als betaald, Bewerken, (Gedeeltelijk) crediteren, Pauzeer betalingstraject, Deelbetaling verwerken, Factuur dupliceren.

### 3.2 Offerte → factuur

- Een **geaccepteerde** offerte (met handtekening + IP + tijdstip, identiek aan ons huidige Quote-ondertekenproces) toont knop **"Factuur maken"** en **"In delen factureren"** (termijnen).
- Na conversie krijgt de offerte status **"Factuur aangemaakt"**; factuur houdt **"Corresponderende offerte"** als harde link.

### 3.3 Creditfacturen

- Volledig of **gedeeltelijk** crediteren; creditfactuur is een gewone factuur met negatief bedrag, **dezelfde referentie** als het origineel, status `Creditfactuur`.

### 3.4 Herinneringen & aanmaningen (betalingstraject)

Configuratie (Instellingen → *Herinneringen & aanmaningen*):

- `Betaaltermijn herinnering` (bv. 14 dagen), `Betaaltermijn aanmaning` (bv. 7 dagen), `Aantal herinneringen` (bv. 2), keuze 2e-herinnering-mail, optie voor negatief openstaand bedrag, "later versturen"-offsets.
- **Tijdlijn-engine** (voorbeeld met deze instellingen):

  | Dag | Gebeurtenis |
  |---|---|
  | 0 | Factuur versturen |
  | 14 | Einde betaaltermijn |
  | 15 | 1e herinnering |
  | 30 | 2e herinnering |
  | 45 | 1e aanmaning |
  | 53 | 2e aanmaning |

- **Automatisch versturen** van herinneringen/aanmaningen op een gekozen tijdstip (dagelijkse cron).
- Per factuur/klant te **pauzeren of uit te sluiten**; afwijkend e-mailadres mogelijk.

### 3.5 Inkoopfacturen (crediteuren)

- **3 invoermethoden**: (1) handmatig, (2) **drag & drop upload**, (3) **doorstuur-e-mailadres** (`…@inkoop.mijnwefact.nl`) → automatisch in de inbox.
- **Queues**: *Nog te verwerken* (binnengekomen, nog niet geboekt) → *Nog te betalen* (met "X dagen te laat") → *Verwerkte/Betaald*.
- **Leverancier** met IBAN; bulkacties: *Betaling voldaan*, **Betaalbatch genereren** (SEPA), *Betaal met QR-code*.
- Velden: volgnummer (`CF…`), leverancier-factuurnummer, factuurdatum, bedrag excl./incl. BTW, status (Betaald + datum).

### 3.6 Abonnementen, instellingen, e-facturatie

- **Abonnementen**: terugkerende facturen (leeg in dit account, maar feature aanwezig).
- **Instellingen** relevant voor het datamodel: prijzen incl./excl. BTW, startmaand boekjaar, standaard verzendmethode, **nummering** (variabelen `[jaar]`/`[maand]`), kopie-e-mail, dagelijkse notificatie, betaaltermijn, **betalingsbevestiging**-mail, **UBL 2.1** (PDF + UBL als losse bestanden), **Peppol** (Peppol-ID), betaalmogelijkheden, BTW-tarieven.
- **Help-catalogus** bevestigt de volledige featureset: deelbetalingen, proforma, BTW verleggen, antidateren, witregel/korting per regel of totaal, pakbon/werkbon/leveringsbon/opdrachtbevestiging, deelfacturen, conceptfacturen samenvoegen, Peppol/UBL.

---

## 4. Hoe het in de InspeXi-codebase past

Het Quote-domein is het bewezen sjabloon. We spiegelen het 1-op-1.

### 4.1 Hergebruik (geen nieuw wiel)

| Bestaand bouwblok | Hergebruik voor facturatie |
|---|---|
| `generateOrgSequentialNumber()` | Gatloze factuurnummering per org (`invoiceNumber`, `creditNumber`, inkoop `CF`-reeks) |
| `quotes.helpers.ts` → `calculateLineTotal`, totaal-/BTW-berekening | Identieke regel-/BTW-calculatie voor `InvoiceLine` |
| `QuotePdfService` (DOCX→PDF via `convert-api` + LibreOffice **of** BLOCKS→PDF via Puppeteer) | `InvoicePdfService` met dezelfde twee paden |
| `QuotePublicService` + `publicToken` | `InvoicePublicService`: klant bekijkt/downloadt factuur in client-portal (later: online betalen) |
| `StorageProvider` (`{orgId}/…`) | `pdfStorageKey`, `ublStorageKey`, inkoop-`documentStorageKey` |
| `NotificationsService.dispatch()` | Nieuwe `NotificationType`-waarden voor factuur-events |
| `EmailTemplatesService` + `template-renderer.ts` + `placeholder.config.ts` | Factuur-, herinnerings-, aanmanings- en betalingsbevestigings-mails |
| `QuoteSchedulerService` (`@Cron`, dagelijks 02:00) | `InvoiceSchedulerService`: auto-herinneringen/aanmaningen, vervallen-detectie, herhaalfacturen genereren |
| Prisma audit (`AUDITED_MODELS` + `MODEL_TABLE_MAP` + `FK_FIELD_RESOLVERS`) | Volledige audit-trail op alle factuur-modellen |
| `paginate`, `orgScope`, `assertFound`, `assertSameOrg` (`@/common`) | Idem in alle nieuwe services |
| `vat` module | Uitbreiden tot BTW-overzicht/rapportage |
| `webhooks` module | Later: Mollie- en Peppol-callbacks |
| Bestaande `Contact`/CRM, `ContactAddress.isInvoice`, `PriceTable`/staffel, `Product.defaultVat` | Factuur hergebruikt relatie, factuuradres, prijsafspraken, producten |
| Portal: `DetailPageLayout`, `TableConfigSidebar`/`useTableConfig`, `AuditHistory`, `StatusBadge`, `formatCurrency`, `DocumentPreviewModal`, `lib/status.ts` | Overzicht-/detailpagina's in dezelfde stijl |

### 4.2 Nieuwe backend-modules (`apps/api/src/modules/`)

```
invoices/                      # verkoopfacturen (kern)
  invoices.controller.ts       # + PublicInvoicesController (client-portal, geen auth)
  invoices.service.ts          # CRUD, regels, status-machine, nummering
  invoice-pdf.service.ts       # PDF/UBL generatie (spiegelt QuotePdfService)
  invoice-public.service.ts    # klantportaal-inzage via publicToken
  invoice-payments.service.ts  # (deel)betalingen, markeren betaald
  invoice-credit.service.ts    # (gedeeltelijk) crediteren, deelfacturen
  invoice-reminders.service.ts # herinneringen + aanmaningen
  invoice-scheduler.service.ts # @Cron: vervallen, auto-herinneren/aanmanen
  invoices.helpers.ts          # VALID_TRANSITIONS, totaal/BTW, serialisatie
purchase-invoices/             # inkoopfacturen / crediteuren
  + intake (upload, e-mail-inbox), OCR-koppeling, betaalqueues
suppliers/                     # leveranciers (zie §5 voor "Contact uitbreiden" alternatief)
recurring-invoices/            # abonnementen / herhaalfacturen
billing-settings/              # factuur-, herinnering-, nummering-, BTW-instellingen
```

### 4.3 Frontend (`apps/portal/src/pages/`)

```
invoices/            # overzicht + detail (tabs: Factuur / Regels / Betalingen / Documenten / Historie)
                     #   + create/edit, send-modal, crediteer-modal, deelfactuur-modal
purchase-invoices/   # inkoop-overzicht (te verwerken / te betalen / betaald) + detail + intake
recurring-invoices/  # abonnementen
```

- Nieuwe statusmaps in `lib/status.ts`: `INVOICE_STATUS`, `PURCHASE_INVOICE_STATUS`, `RECURRING_STATUS`.
- Sidebar: nieuwe secties **Facturen** (sub: Verkoopfacturen, Herinneringen, BTW-overzicht) en **Inkoop** (sub: Inkoopfacturen, Leveranciers, Betaalbatches) met rol-gating (`BACKOFFICE`, `WERKVOORBEREIDER`, `MANAGER`, `ORG_ADMIN`).
- Client-portal (`:5174`): factuur inzien/downloaden; later online betalen.

---

## 5. Datamodel (Prisma — schets)

Alle tabellen `@@map("imp_…")`, geldbedragen `Decimal(12,2)`, per-org nummering via `@@unique([orgId, …])`. Onderstaande velden zijn een ontwerp-schets, niet definitief.

### 5.1 Enums

```prisma
enum InvoiceType        { VERKOOPFACTUUR  CREDITFACTUUR  PROFORMA }
enum InvoiceStatus      { CONCEPT  CONCEPT_GEBLOKKEERD  CONCEPT_INGEPLAND
                          VERSTUURD  DEELS_BETAALD  BETAALD
                          CREDIT  VERVALLEN  GEPAUZEERD  GEANNULEERD }
enum InvoiceLineType    { REGEL  TEKST  WITREGEL }        // tekst/witregel net als WeFact
enum PaymentMethod      { OVERBOEKING  INCASSO  IDEAL  CONTANT  PIN  OVERIG }
enum ReminderType       { HERINNERING  AANMANING }
enum PurchaseStatus     { TE_VERWERKEN  TE_BETALEN  DEELS_BETAALD  BETAALD  AFGEKEURD }
enum PurchaseSource     { HANDMATIG  UPLOAD  EMAIL }
enum RecurringInterval  { WEEK  MAAND  KWARTAAL  HALFJAAR  JAAR }
enum RecurringStatus    { ACTIEF  GEPAUZEERD  GESTOPT }
```

### 5.2 Verkoopfactuur

```prisma
model Invoice {
  id               String        @id @default(uuid()) @db.Uuid
  orgId            String        @map("org_id") @db.Uuid
  invoiceNumber    String?       @map("invoice_number")   // null in conceptfase; gevuld bij versturen
  conceptNumber    String?       @map("concept_number")   // [concept]NNNN
  type             InvoiceType   @default(VERKOOPFACTUUR)
  status           InvoiceStatus @default(CONCEPT)

  // relaties (hergebruik CRM + offerte + inspectie)
  contactId        String        @map("contact_id") @db.Uuid
  invoiceAddressId String?       @map("invoice_address_id") @db.Uuid
  quoteId          String?       @map("quote_id") @db.Uuid          // corresponderende offerte
  projectId        String?       @map("project_id") @db.Uuid
  inspectionPlanId String?       @map("inspection_plan_id") @db.Uuid
  workOrderId      String?       @map("work_order_id") @db.Uuid
  creditedInvoiceId String?      @map("credited_invoice_id") @db.Uuid  // origineel bij creditfactuur
  parentInvoiceId  String?       @map("parent_invoice_id") @db.Uuid     // bij deelfacturen

  subject          String
  reference        String?                                            // klantreferentie
  invoiceDate      DateTime?     @map("invoice_date")
  dueDate          DateTime?     @map("due_date")
  paymentTermDays  Int           @default(14) @map("payment_term_days")

  subtotal         Decimal       @default(0) @db.Decimal(12, 2)
  discountTotal    Decimal       @default(0) @map("discount_total") @db.Decimal(12, 2)
  vatTotal         Decimal       @default(0) @map("vat_total") @db.Decimal(12, 2)
  total            Decimal       @default(0) @db.Decimal(12, 2)
  paidAmount       Decimal       @default(0) @map("paid_amount") @db.Decimal(12, 2)
  // openAmount = total - paidAmount (berekend)

  reminderCount    Int           @default(0) @map("reminder_count")
  dunningCount     Int           @default(0) @map("dunning_count")
  lastReminderAt   DateTime?     @map("last_reminder_at")
  paymentPaused    Boolean       @default(false) @map("payment_paused")
  reminderExcluded Boolean       @default(false) @map("reminder_excluded")

  internalNotes    String?       @map("internal_notes")
  customFields     Json?         @map("custom_fields")               // Project / Relatiemanager / Eigenaar
  publicToken      String?       @unique @map("public_token")
  pdfStorageKey    String?       @map("pdf_storage_key")
  ublStorageKey    String?       @map("ubl_storage_key")             // Peppol/UBL
  peppolStatus     String?       @map("peppol_status")

  createdBy        String        @map("created_by") @db.Uuid
  sentAt           DateTime?     @map("sent_at")
  viewedAt         DateTime?     @map("viewed_at")
  paidAt           DateTime?     @map("paid_at")
  isDeleted        Boolean       @default(false) @map("is_deleted")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")

  lines            InvoiceLine[]
  payments         Payment[]
  reminders        InvoiceReminder[]

  @@unique([orgId, invoiceNumber])
  @@map("imp_invoices")
}

model InvoiceLine {
  id          String          @id @default(uuid()) @db.Uuid
  invoiceId   String          @map("invoice_id") @db.Uuid
  productId   String?         @map("product_id") @db.Uuid
  lineType    InvoiceLineType @default(REGEL)
  lineDate    DateTime?       @map("line_date")          // datum per regel (uitvoerdatum inspectie)
  description String
  quantity    Float           @default(1)
  unit        String?
  unitPrice   Decimal         @default(0) @map("unit_price") @db.Decimal(12, 2)
  vatRate     Float           @default(21) @map("vat_rate")
  discountPct Float           @default(0) @map("discount_pct")
  lineTotal   Decimal         @default(0) @map("line_total") @db.Decimal(12, 2)
  sortOrder   Int             @default(0) @map("sort_order")
  @@index([invoiceId])
  @@map("imp_invoice_lines")
}

model Payment {
  id          String        @id @default(uuid()) @db.Uuid
  orgId       String        @map("org_id") @db.Uuid
  invoiceId   String        @map("invoice_id") @db.Uuid
  amount      Decimal       @db.Decimal(12, 2)
  paymentDate DateTime      @map("payment_date")
  method      PaymentMethod @default(OVERBOEKING)
  reference   String?
  // voorbereid op bankkoppeling/Mollie:
  externalRef String?       @map("external_ref")        // Mollie payment id / bank transactie id
  note        String?
  createdBy   String?       @map("created_by") @db.Uuid
  createdAt   DateTime      @default(now()) @map("created_at")
  @@index([invoiceId])
  @@map("imp_payments")
}

model InvoiceReminder {
  id        String       @id @default(uuid()) @db.Uuid
  invoiceId String       @map("invoice_id") @db.Uuid
  type      ReminderType
  sequence  Int          // 1e, 2e, ...
  sentAt    DateTime     @map("sent_at")
  sentTo    String       @map("sent_to")
  storageKey String?     @map("storage_key")
  @@index([invoiceId])
  @@map("imp_invoice_reminders")
}
```

### 5.3 Inkoopfactuur (crediteuren)

**Leverancier**: twee opties — (a) los `Supplier`-model, of (b) **aanbevolen**: het bestaande `Contact` uitbreiden met `isSupplier Boolean` + een `iban`-veld (een relatie kan klant én leverancier zijn, net als WeFact's unified "Relaties"). Hieronder optie (b).

```prisma
// Contact-uitbreiding: + isSupplier, + iban, + supplierNumber
model PurchaseInvoice {
  id                  String         @id @default(uuid()) @db.Uuid
  orgId               String         @map("org_id") @db.Uuid
  sequenceNumber      String         @map("sequence_number")   // CF-reeks per org
  supplierContactId   String?        @map("supplier_contact_id") @db.Uuid
  supplierInvoiceNo   String?        @map("supplier_invoice_no")
  invoiceDate         DateTime?      @map("invoice_date")
  dueDate             DateTime?      @map("due_date")
  subtotal            Decimal        @default(0) @db.Decimal(12, 2)
  vatTotal            Decimal        @default(0) @map("vat_total") @db.Decimal(12, 2)
  total               Decimal        @default(0) @db.Decimal(12, 2)
  paidAmount          Decimal        @default(0) @map("paid_amount") @db.Decimal(12, 2)
  status              PurchaseStatus @default(TE_VERWERKEN)
  source              PurchaseSource @default(HANDMATIG)
  documentStorageKey  String?        @map("document_storage_key")  // originele PDF
  ocrData             Json?          @map("ocr_data")              // herkende velden
  costCategory        String?        @map("cost_category")         // kostensoort (voor BTW-overzicht)
  linkedInvoiceId     String?        @map("linked_invoice_id") @db.Uuid  // bv. SCIOS-afmelding ↔ verkoopfactuur
  paidAt              DateTime?      @map("paid_at")
  createdBy           String?        @map("created_by") @db.Uuid
  isDeleted           Boolean        @default(false) @map("is_deleted")
  createdAt           DateTime       @default(now()) @map("created_at")
  lines               PurchaseInvoiceLine[]
  @@unique([orgId, sequenceNumber])
  @@map("imp_purchase_invoices")
}

model PurchaseInvoiceLine {
  id          String  @id @default(uuid()) @db.Uuid
  purchaseId  String  @map("purchase_id") @db.Uuid
  description String
  amount      Decimal @db.Decimal(12, 2)
  vatRate     Float   @default(21) @map("vat_rate")
  @@index([purchaseId])
  @@map("imp_purchase_invoice_lines")
}
```

### 5.4 Herhaalfacturen + instellingen

```prisma
model RecurringInvoice {
  id              String            @id @default(uuid()) @db.Uuid
  orgId           String            @map("org_id") @db.Uuid
  contactId       String            @map("contact_id") @db.Uuid
  inspectionPlanId String?          @map("inspection_plan_id") @db.Uuid  // koppel (her)inspectiecyclus
  subject         String
  interval        RecurringInterval
  intervalCount   Int               @default(1)
  startDate       DateTime          @map("start_date")
  nextRunDate     DateTime          @map("next_run_date")
  endDate         DateTime?         @map("end_date")
  autoSend        Boolean           @default(false) @map("auto_send")
  status          RecurringStatus   @default(ACTIEF)
  templateLines   Json              @map("template_lines")
  @@map("imp_recurring_invoices")
}

model BillingSettings {                       // 1-op-1 met Organization
  orgId                 String  @id @map("org_id") @db.Uuid
  pricesIncludeVat      Boolean @default(false) @map("prices_include_vat")
  fiscalYearStartMonth  Int     @default(1) @map("fiscal_year_start_month")
  invoiceNumberFormat   String  @default("F[jaar]") @map("invoice_number_format")
  defaultPaymentTerm    Int     @default(14) @map("default_payment_term")
  reminderTermDays      Int     @default(14) @map("reminder_term_days")
  dunningTermDays       Int     @default(7)  @map("dunning_term_days")
  reminderCount         Int     @default(2)  @map("reminder_count")
  reminderDelayDays     Int     @default(0)  @map("reminder_delay_days")
  dunningDelayDays      Int     @default(0)  @map("dunning_delay_days")
  autoSendReminders     Boolean @default(false) @map("auto_send_reminders")
  autoSendDunnings      Boolean @default(false) @map("auto_send_dunnings")
  autoSendTime          String  @default("09:00") @map("auto_send_time")
  ublEnabled            Boolean @default(false) @map("ubl_enabled")
  peppolId              String? @map("peppol_id")
  copyEmail             String? @map("copy_email")
  @@map("imp_billing_settings")
}
```

### 5.5 Notificaties

Toevoegen aan `NotificationType`:
`FACTUUR_VERSTUURD`, `FACTUUR_BEKEKEN`, `FACTUUR_BETAALD`, `FACTUUR_DEELS_BETAALD`, `FACTUUR_VERVALLEN`, `FACTUUR_HERINNERING_VERSTUURD`, `FACTUUR_AANMANING_VERSTUURD`, `CREDITFACTUUR_AANGEMAAKT`, `INKOOPFACTUUR_ONTVANGEN`, `INKOOPFACTUUR_TE_BETALEN`, `INKOOPFACTUUR_VERVALLEN`, `HERHAALFACTUUR_GEGENEREERD`.

### 5.6 Status-machine (verkoopfactuur)

```
CONCEPT ──verstuur──▶ VERSTUURD ──(deel)betaling──▶ DEELS_BETAALD ──restbetaling──▶ BETAALD
   │                     │  ╲                                            ▲
   │                     │   ╲──volledige betaling────────────────────────┘
   │                     │
   │                     ├──betaaltermijn verlopen (cron)──▶ VERVALLEN ──betaling──▶ BETAALD
   │                     └──pauzeer──▶ GEPAUZEERD
   └──annuleer──▶ GEANNULEERD
VERSTUURD/…/BETAALD ──(gedeeltelijk) crediteren──▶ nieuwe Invoice(type=CREDITFACTUUR, status=CREDIT)
```

**Onwijzigbaarheid**: na `VERSTUURD` is `Invoice` (en regels) read-only; correctie uitsluitend via creditfactuur (fiscaal verplicht). Conceptnummer → definitief gatloos nummer pas bij versturen.

---

## 6. Verbeterpunten t.o.v. WeFact

Dit is waar InspeXi *beter* kan zijn dan WeFact, juist omdat alles in één platform zit:

1. **Harde koppeling i.p.v. vrij-tekst referentie.** WeFact koppelt offerte↔factuur via een tekstveld (`OF…`) en het project staat in een eigen veld. InspeXi koppelt `Invoice ↔ Quote ↔ Project ↔ InspectionPlan ↔ WorkOrder ↔ Location` als echte foreign keys. Resultaat: per inspectie zie je *geoffreerd → gefactureerd → betaald* in één oogopslag.
2. **Automatisch factureren bij oplevering.** De veelgebruikte betalingsconditie *"100% na uitvoering inspectie, vóór oplevering rapportage en afmelding, 14 dagen netto"* wordt een **workflow-trigger**: zodra het inspectierapport definitief/afgemeld is, genereert het systeem automatisch een conceptfactuur. WeFact kan dit niet.
3. **Meerwerk uit het veld → automatisch op de factuur.** WeFact zet de *Verrekenstaat* (`IDB-VS-12`) als statische tekstregel. In InspeXi kan meerwerk (extra verdeler/omvormer, administratieve/fysieke herinspectie, no-show, voorrijkosten) tijdens de inspectie in de PWA/meetstaat worden vastgelegd en **automatisch als factuurregels** worden voorgesteld.
4. **Betalingscondities als data, niet als tekstregel.** Gestructureerde betaalcondities (bv. *100% na uitvoering* of *50/50 termijn*) sturen de deelfacturatie en herinneringstiming, i.p.v. een `BC100-V14`-tekstproduct.
5. **Eén relatiebeheer.** Geen aparte "Relaties"-administratie; facturen gebruiken het bestaande CRM (`Contact`, contactpersonen, factuuradres `isInvoice`, **prijstabellen/staffel per klant**). Geen dubbele data, geen sync-issues.
6. **Klant-prijsafspraken automatisch.** Factuurregels resolven dezelfde `PriceTable`/staffel als offertes (`resolvePrice`), inclusief klant-specifieke prijzen — WeFact-producten zijn platter.
7. **Marge per inspectie.** Door de **SCIOS-afmeldingskosten** (inkoopfactuur van *Stichting SCIOS*) te koppelen aan de bijbehorende verkoopfactuur/inspectie zie je direct de marge per opdracht. Uniek t.o.v. losse boekhoudpakketten.
8. **Audit & rolgebaseerde controle.** Onze audit-trail logt automatisch elke wijziging. Optioneel: hergebruik de offerte-goedkeuringsflow voor **creditfacturen boven een drempel** (interne controle/fraudepreventie) — WeFact heeft geen credit-goedkeuring.
9. **Geïntegreerd klantportaal.** De klant ziet offerte, inspectierapport, documenten én facturen + betaalstatus op één plek (`:5174`), i.p.v. WeFact's geïsoleerde "online betalen"-link.
10. **Bulk-facturatie per periode.** "Factureer alle opgeleverde inspecties van deze week" in één run, gefilterd op inspecteur/klant/scope.

---

## 7. Aanbevelingen specifiek voor een inspectiebedrijf

Concrete admin-besparende ideeën (deels in de fases verwerkt, deels backlog):

- **Trigger-gebaseerd factureren** gekoppeld aan de inspectie-lifecycle: conceptfactuur bij *rapport definitief* of *afgemeld bij SCIOS*. Bespaart het handmatig overtikken dat nu in WeFact gebeurt.
- **Seed een inspectie-productcatalogus** met SCIOS-scopecodes (Scope 8/10/12, EBI/PI), *Afmelding Elektrisch Materieel*, *Betalingscondities*-producten en *Verrekenstaat/meerwerk*-tarieven — met de juiste BTW (inspectie 21%, condities/verrekenstaat 0% tekstregel).
- **(Her)inspectie-signalering → omzet.** Een SCIOS-afmelding (bv. EBI) verloopt na X jaar. Koppel een **herhaalfactuur of automatische lead/offerte** aan die vervaldatum: het systeem genereert tijdig een herinspectie-offerte. Dit is zowel administratie- als omzetwinst.
- **Debiteurenbeheer-dashboard**: openstaand per klant met aging (0-30 / 30-60 / 60+ dagen) en één-klik herinneren — strakker dan losse WeFact-lijsten.
- **Werkbon/opdrachtbevestiging** genereren uit de bestaande `document-generation`/`document-templates`-engine, met dezelfde inspectiedata.
- **SCIOS/keuringsinstantie-koppeling op de kostenkant**: inkoopfacturen van *Stichting SCIOS*, *Tesko*, *Elektroraad* etc. automatisch categoriseren via het mail-inbox/OCR-kanaal.
- **BTW-correctheid uit de doos**: standaard 21% op inspectie, 0% op tekst-/conditieregels, ondersteuning *BTW verleggen* voor specifieke B2B-gevallen.

---

## 8. Gefaseerd plan van aanpak

Elke fase is afzonderlijk opleverbaar/testbaar (unit + e2e + browser-smoketest), conform de bestaande werkwijze. Branchnaam-suggestie tussen haakjes.

### Fase 0 — Fundament & datamodel (`feat/invoicing-foundation`)
- Prisma-modellen + enums (§5), migraties **vanuit `apps/api/`** (`prisma migrate dev`, nooit `db push`).
- `BillingSettings` + uitbreiding `Organization`/`Contact` (`isSupplier`, `iban`).
- Nummering (`generateOrgSequentialNumber` voor `invoiceNumber`/`CF`), `lib/status.ts`-maps.
- Audit registreren (`AUDITED_MODELS`, `MODEL_TABLE_MAP`, FK-resolvers), `seed.ts`-cleanupvolgorde, `types/index.ts`.
- Nieuwe `NotificationType`-waarden.
- **Op te leveren**: leeg maar gemigreerd schema, instellingenpagina (betaaltermijn, nummering, BTW, herinneringsschema).

### Fase 1 — Verkoopfacturen kern (`feat/sales-invoices`)
- CRUD + regels (incl. tekst/witregel), totaal-/BTW-berekening (hergebruik quote-helpers).
- Status-machine concept → verstuurd; **onwijzigbaarheid** na versturen; conceptnummer → definitief.
- PDF-generatie (`InvoicePdfService`, spiegelt `QuotePdfService`), versturen per e-mail (mail-template), **markeren als betaald**, deelbetaling (`Payment`).
- Portal: overzicht (`TableConfigSidebar`) + detail (tabs Factuur/Regels/Betalingen/Documenten/Historie) + send-modal.
- Client-portal: factuur inzien/downloaden via `publicToken`.
- Notificaties: `FACTUUR_VERSTUURD/BEKEKEN/BETAALD`.
- **Op te leveren**: handmatige verkoopfactuur volledig end-to-end.

### Fase 2 — Offerte→factuur, creditfacturen, deelfacturen (`feat/invoice-from-quote`)
- "Factuur maken" vanaf `GEACCEPTEERD` offerte (regels overnemen, `quoteId`-link, offertestatus → "Factuur aangemaakt").
- Volledig + **gedeeltelijk crediteren** (`invoice-credit.service.ts`, `creditedInvoiceId`).
- **Deelfacturen / in delen factureren** (termijnen, `parentInvoiceId`).
- Optioneel: credit-goedkeuringsdrempel (hergebruik approval-flow).
- **Op te leveren**: volledige offerte→factuur→credit-keten.

### Fase 3 — Betalingstraject: herinneringen & aanmaningen + debiteuren (`feat/invoice-dunning`)
- Tijdlijn-engine o.b.v. `BillingSettings` (§3.4), handmatig + **automatisch versturen** via `InvoiceSchedulerService` (`@Cron`, spiegelt `QuoteSchedulerService`).
- `VERVALLEN`-detectie, `InvoiceReminder`-log, pauzeren/uitsluiten, afwijkend e-mailadres.
- **Debiteuren-overzicht** met aging + één-klik herinneren.
- Notificaties + klant-mails (herinnering/aanmaning/betalingsbevestiging).
- **Op te leveren**: volledig geautomatiseerd betalingstraject + debiteurenbeheer.

### Fase 4 — Inkoopfacturen / crediteuren (`feat/purchase-invoices`)
- `PurchaseInvoice`(-lines), leveranciers (Contact-uitbreiding), queues *te verwerken → te betalen → betaald*.
- Intake: handmatig + upload + **doorstuur-e-mailadres-inbox** + **OCR-herkenning** (bedrag/leverancier/datum; provider t.b.v. §11).
- Crediteuren-overzicht (aging), `costCategory`, koppeling inkoop↔verkoop (marge).
- (SEPA-betaalbatch als nice-to-have / later.)
- **Op te leveren**: volledige crediteuren-administratie met automatische intake.

### Fase 5 — BTW-overzicht & export accountant (`feat/vat-reporting`)
- Uitbreiding `vat`-module: BTW per periode/tarief (te betalen BTW verkoop − voorbelasting inkoop).
- Debiteuren/crediteuren-rapporten; export **UBL per factuur**, **CSV/Excel-register**, optioneel **XAF auditfile**.
- **Op te leveren**: maand/kwartaal-BTW-overzicht + accountant-export.

### Fase 6 — Peppol/UBL e-facturatie (`feat/einvoicing-peppol`)
- UBL 2.1-generatie naast de PDF (instelling "PDF + UBL als losse bestanden").
- Verzenden via Peppol-access-point-provider (zie §11), Peppol-ID-registratie, statusberichten (IRM) via `webhooks`.
- **Op te leveren**: e-facturen verzenden via Peppol.

### Fase 7 — Periodieke/herhaalfacturen (`feat/recurring-invoices`)
- `RecurringInvoice` + `InvoiceSchedulerService`-generatie van conceptfacturen op `nextRunDate`, optioneel auto-versturen.
- Koppeling aan (her)inspectiecyclus / vervaldatum afmelding.
- **Op te leveren**: abonnementen + automatische herinspectie-facturatie.

### Fase 8 — Online betalen + bankkoppeling (later) (`feat/payments-bank`)
- Mollie-betaallink (iDEAL) op PDF/mail, webhook → `Payment` → status (`externalRef` ligt klaar).
- Bankimport (CAMT.053/PSD2) + **automatisch afletteren** op bedrag + factuurnummer/referentie.
- **Op te leveren**: betaallinks + (semi-)automatische betaalverwerking.

---

## 9. Compliance & risico's

- **Gatloze, onwijzigbare nummering** per administratie en **read-only na versturen** — fiscaal verplicht; vroeg in Fase 0/1 goed regelen.
- **BTW-randgevallen**: 0%-regels, *BTW verleggen*, intracommunautair — expliciet testen.
- **Bewaarplicht 7 jaar**: PDF/UBL + brondocumenten via `StorageProvider`, niet hard verwijderen (soft-delete + retentie).
- **E-mail deliverability**: herinneringen/aanmaningen via Resend met SPF/DKIM (instellingen bestaan al voor de org).
- **Privacy/AVG**: factuur-/betaaldata is persoonsgegeven; klantportaal-toegang via bestaande magic-link/`ClientUser`-realm.
- **Scheduler-belasting**: dagelijkse cron multi-tenant — batch per org, fire-and-forget notificaties (bestaand patroon).

## 10. Cut-over & migratie (WeFact uitfaseren)

Migratie was niet als prioriteit gekozen, maar omdat InspeXi leidend wordt, is een **cut-over-strategie** nodig:

- **Relaties & producten** staan grotendeels al in InspeXi (CRM/producten) — minimale migratie.
- **Openstaande debiteuren**: alleen de op cut-over-datum nog openstaande facturen overnemen (als historische/afgeronde records) om het debiteurensaldo kloppend te krijgen.
- **Nummervervolg**: stel de start van `invoiceNumber` zó in dat de reeks naadloos aansluit op WeFact (geen overlap/gaten).
- **Aanpak**: kies een cut-over-datum (bv. begin boekjaar/kwartaal), draai kort parallel, exporteer WeFact-historie (PDF/UBL) als archief. → **Beslispunt voor jou** (zie §11).

## 11. Open beslispunten

1. **OCR-provider voor inkoopfacturen** (Fase 4): zelf bouwen vs. dienst (bv. Klippa/Whoosh/Google Document AI). Voorkeur?
2. **Peppol-access-point** (Fase 6): provider als Storecove/Recommand/Nimbus — heb je al een Peppol-ID/voorkeur?
3. **Betaalprovider** (Fase 8): Mollie (NL-standaard, iDEAL) bevestigen.
4. **Cut-over & migratie** (§10): cut-over-datum + wel/niet historische facturen importeren + startfactuurnummer.
5. **Factuursjabloon/huisstijl**: BLOCKS-builder (zoals offertes) óf DOCX-template (zoals offerte-DOCX) als primair factuurontwerp?
6. **Credit-goedkeuring**: willen we een goedkeuringsdrempel op creditfacturen (interne controle)?

---

*Volgende stap na akkoord: Fase 0 uitwerken als concrete implementatie-PRD met DTO's, endpoints en testplan, en de Prisma-migratie opzetten.*
