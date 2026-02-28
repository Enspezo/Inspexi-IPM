# PRD-07 — Planning & Afspraakbeheer

*Inspectie Management Platform — Module 7*
*Versie 1.0 | Februari 2026 | Vertrouwelijk — Intern gebruik*

---

## 7.1 Doel

De planningsmodule zorgt voor het inplannen, beheren en communiceren van inspectieopdrachten. Wanneer een offerte geaccepteerd wordt, komt deze automatisch in de planning terecht. Medewerkers plannen datum, tijd, duur en inspecteurs in. Alle betrokken partijen (inspecteurs, opdrachtgever) worden proactief geïnformeerd via email en in-platform notificaties. Inspecteurs kunnen hun agenda synchroniseren via een persoonlijke iCal-feed.

---

## 7.2 Kernconcepten & Terminologie

| Term | Betekenis |
|------|-----------|
| Planregel | Een in te plannen of geplande inspectieopdracht |
| Hoofdinspecteur | Eerste toegewezen inspecteur op een planregel, primaire contactpersoon voor de opdrachtgever |
| Opdrachtgever | De klant/relatie gekoppeld aan de planregel |
| Concept | Planregel heeft datum/tijd/inspecteur maar nog niet alle inspecteurs hebben geaccepteerd |
| Gepland | Alle inspecteurs hebben geaccepteerd |
| Vervallen | Planregel geannuleerd door verzetten of handmatige annulering |

---

## 7.3 Prisma Schema

```prisma
model imp_planning_items {
  id                String              @id @default(uuid())
  org_id            String
  quote_id          String?             // nullable: afspraak zonder offerte mogelijk
  contact_id        String              // opdrachtgever (relatie)
  location_id       String              // verplicht: locatie/object
  product_id        String?             // dienst/product gekoppeld aan planregel
  product_name      String              // snapshot van productnaam op moment van plannen
  status            PlanningStatus
  is_cancelled      Boolean             @default(false)
  cancelled_at      DateTime?
  cancelled_by      String?
  cancel_reason     String?

  // Tijdsplanning
  scheduled_date    DateTime?           // datum + starttijd
  duration_hours    Float?              // in uren met decimalen (bijv. 1.25 = 1u15m)
  end_time          DateTime?           // berekend: scheduled_date + duration_hours

  // Labels & metadata
  labels            String[]            @default([])  // bijv. ["Verplaatst"]
  internal_notes    String?
  public_token      String              @unique @default(uuid()) // voor publieke portal pagina

  // Verplaatsing referentie
  replaced_by_id    String?             // FK naar nieuwe planregel bij verzetten
  replaces_id       String?             // FK naar originele planregel bij verzetten
  original_date     DateTime?           // originele datum bij verplaatsing

  created_by        String
  created_at        DateTime            @default(now())
  updated_at        DateTime            @updatedAt

  // Relaties
  inspectors        imp_planning_inspectors[]
  history           imp_planning_history[]
  reschedule_requests imp_reschedule_requests[]
  replaced_by       imp_planning_items? @relation("Replacement", fields: [replaced_by_id], references: [id])
  replaces          imp_planning_items? @relation("Replacement", fields: [replaces_id], references: [id])
}

model imp_planning_inspectors {
  id                 String           @id @default(uuid())
  planning_item_id   String
  user_id            String           // inspecteur user_id
  is_primary         Boolean          @default(false) // hoofdinspecteur
  acceptance_status  AcceptanceStatus @default(PENDING)
  accepted_at        DateTime?
  rejected_at        DateTime?
  rejection_note     String?
  planning_item      imp_planning_items @relation(fields: [planning_item_id], references: [id])
}

model imp_planning_history {
  id               String   @id @default(uuid())
  planning_item_id String
  user_id          String?  // null bij systeem-events
  action           String   // bijv. "STATUS_CHANGED", "DATE_CHANGED", "INSPECTOR_ADDED", "RESCHEDULED"
  description      String   // leesbare omschrijving
  old_value        String?  // JSON string van oude waarde
  new_value        String?  // JSON string van nieuwe waarde
  created_at       DateTime @default(now())
  planning_item    imp_planning_items @relation(fields: [planning_item_id], references: [id])
}

model imp_reschedule_requests {
  id               String   @id @default(uuid())
  planning_item_id String
  requested_by     String?  // null = klant (niet ingelogd)
  client_name      String?  // naam klant indien niet ingelogd
  preferred_date   DateTime
  reason           String
  status           RescheduleStatus @default(PENDING)
  processed_by     String?
  processed_at     DateTime?
  created_at       DateTime @default(now())
  planning_item    imp_planning_items @relation(fields: [planning_item_id], references: [id])
}

// Inspecteur kleur wordt opgeslagen op het user profiel
// Uitbreiding op imp_users:
// color            String?   // hex kleurcode, bijv. "#3B82F6"

enum PlanningStatus {
  NOG_TE_PLANNEN    // net aangemaakt vanuit geaccepteerde offerte, nog geen datum/inspecteur
  CONCEPT           // datum + inspecteur toegewezen, wacht op acceptatie
  GEPLAND           // alle inspecteurs geaccepteerd
  AFGEROND          // inspectie uitgevoerd
  VERVALLEN         // geannuleerd
}

enum AcceptanceStatus {
  PENDING
  ACCEPTED
  REJECTED
}

enum RescheduleStatus {
  PENDING
  PROCESSED
}
```

---

## 7.4 Planregel Statussen & Overzicht

### Statusflow

```
Offerte geaccepteerd
        │
        ▼
  NOG_TE_PLANNEN  ──── Datum + inspecteur(s) toegewezen
        │
        ▼
    CONCEPT  ──── Visueel onderscheid (zie §7.8)
        │         Alle inspecteurs accepteren
        ▼
    GEPLAND  ──── Afspraakbevestiging + .ics naar opdrachtgever
        │
        ├──── Inspectie uitgevoerd ──► AFGEROND
        │
        └──── Verzetten ──► huidige planregel → VERVALLEN (label: "Verplaatst")
                            nieuwe planregel → NOG_TE_PLANNEN → CONCEPT → GEPLAND
```

### Statusbeschrijvingen

| Status | Beschrijving | Kleur (UI indicatie) |
|--------|-------------|---------------------|
| NOG_TE_PLANNEN | Wacht op datum en inspecteur | Oranje |
| CONCEPT | Datum/inspecteur toegewezen, wacht op acceptatie | Geel + streeprand in kalender |
| GEPLAND | Volledig bevestigd | Groen |
| AFGEROND | Inspectie heeft plaatsgevonden | Grijs/blauw |
| VERVALLEN | Geannuleerd of verplaatst | Rood/doorgestreept, standaard verborgen |

---

## 7.5 Functionele Vereisten

### 7.5.1 Aanmaken vanuit geaccepteerde offerte

- Wanneer een offerte de status `GEACCEPTEERD` krijgt, wordt automatisch een planregel aangemaakt met status `NOG_TE_PLANNEN`
- De planregel erft: `contact_id`, `location_id`, `org_id` en `quote_id` van de offerte
- Het product/dienst wordt overgenomen van de primaire offerteregel (of de medewerker selecteert er één bij het plannen)
- De duur wordt vooraf ingevuld indien het product een standaard duur heeft, anders verplicht handmatig invullen bij het toewijzen van datum/tijd

### 7.5.2 Aanmaken zonder offerte

- Medewerkers kunnen ook handmatig een planregel aanmaken zonder gekoppelde offerte
- Verplichte velden: contact (relatie), locatie, product/dienst, datum, tijd, duur, minimaal één inspecteur
- Optioneel: interne notitie

### 7.5.3 Inplannen (datum, tijd, inspecteur toewijzen)

Alle medewerkers (org admin, manager, backoffice, werkvoorbereider, inspecteur) kunnen een planregel inplannen:

- Datum en starttijd selecteren
- Duur invullen in uren met decimalen (bijv. `1.25` voor 1 uur 15 minuten) — eindtijd wordt automatisch berekend en getoond
- Één of meerdere inspecteurs toewijzen, eerste inspecteur wordt automatisch hoofdinspecteur
- Hoofdinspecteur kan handmatig gewijzigd worden
- Na opslaan: status → `CONCEPT`, alle toegewezen inspecteurs ontvangen notificatie + email met acceptatieverzoek

### 7.5.4 Acceptatie door inspecteurs

- Elke toegewezen inspecteur ontvangt een notificatie (in-platform + email) met een directe link naar de planregel
- De inspecteur kan de afspraak **accepteren** of **weigeren** (met verplichte reden bij weigering)
- Zodra **alle** toegewezen inspecteurs hebben geaccepteerd → status `GEPLAND`
- Bij weigering door één inspecteur: status blijft `CONCEPT`, hoofdinspecteur ontvangt notificatie met de reden. De hoofdinspecteur lost dit onderling op (bijv. andere inspecteur toewijzen of acceptatie alsnog regelen)
- Bij het vervangen van een geweigerde inspecteur door een andere: nieuwe inspecteur krijgt opnieuw acceptatieverzoek, acceptance_status van de nieuwe inspecteur = `PENDING`

### 7.5.5 Afspraakbevestiging bij status GEPLAND

Zodra alle inspecteurs hebben geaccepteerd (status → `GEPLAND`):

- Email verstuurd naar opdrachtgever via Resend
- Email bevat:
  - Datum, tijd en duur van de afspraak
  - Locatie/object adres
  - Naam en contactgegevens van de hoofdinspecteur
  - Publieke link naar de afspraakpagina: `platform.nl/afspraak/{public_token}`
  - `.ics` bestand als bijlage (zie §7.7)

### 7.5.6 Verzetten van een afspraak

**Door medewerker:**
- Medewerker klikt op "Afspraak verzetten" in het platform
- Verplicht: reden invullen
- Huidige planregel → status `VERVALLEN`, label `Verplaatst`, `is_cancelled = true`
- Nieuwe planregel aangemaakt met `replaces_id` naar de oude, status `NOG_TE_PLANNEN`
- Veld `original_date` op de nieuwe planregel bevat de originele datum
- History entry op beide planregels met reden en originele datum
- Opdrachtgever ontvangt email: "Uw afspraak is verplaatst" (géén nieuwe bevestiging, dit volgt pas na opnieuw accepteren door inspecteurs)

**Door klant via portal:**
- Knop "Afspraak verzetten" zichtbaar op publieke afspraakpagina **indien afspraak meer dan 7 dagen in de toekomst**
- Indien afspraak binnen 7 dagen: knop grijs, tekst "Neem contact op om de afspraak te verzetten"
- Klant vult formulier in: voorkeursdatum + reden
- Na versturen: nieuwe taak aangemaakt (type: `AFSPRAAK_VERZETTEN`) gekoppeld aan de planregel, toegewezen aan de medewerker die de afspraak heeft aangemaakt (of de backoffice groep)
- Notificatie verstuurd naar medewerkers: "Klant verzoekt afspraak te verzetten"
- De afspraak wordt **niet** automatisch geannuleerd — een medewerker verwerkt het verzoek handmatig

### 7.5.7 Vervallen afspraken in het overzicht

- Vervallen planregels hebben label `Vervallen` (rood badge)
- Standaard **niet** zichtbaar in lijst en kalender
- Zichtbaar via filter "Toon vervallen afspraken"
- In de kalender getoond als doorkruist/grijs blok indien filter actief

---

## 7.6 Inspecteur Kleuren

### 7.6.1 Doel

Elke inspecteur heeft een persoonlijke kleur voor visuele herkenning in de kalenderweergave. De kleur wordt toegepast als:
- Achtergrondkleur van de avatar (initialen)
- Border/ring om de profielfoto indien aanwezig
- Kleurmarkering van de afspraak in de kalenderweergave

### 7.6.2 Instellen

- **Inspecteur zelf**: kan eigen kleur instellen in profielinstellingen via colorpicker of keuze uit basiskleuren
- **Org Admin**: kan de kleur van elke inspecteur instellen of overschrijven voor consistentie in het team
- Basiskleuren (vooraf gedefinieerd palet, minimaal 16 opties): standaard TailwindCSS 500-kleuren (rood, oranje, geel, groen, teal, blauw, indigo, paars, roze, etc.)
- Colorpicker: vrije HEX kleurkeuze
- Default kleur bij nieuw account: willekeurige kleur uit het basispalet

### 7.6.3 Technische implementatie

Uitbreiding op `imp_users`:

```prisma
// Toevoegen aan imp_users model:
color   String?   // HEX kleurcode, bijv. "#3B82F6"
```

API response voor users bevat altijd het `color` veld. Frontend past de kleur toe op avatar en profielfoto border.

---

## 7.7 iCal Feed per Inspecteur

### 7.7.1 URL structuur

Elke inspecteur heeft een unieke, moeilijk te raden iCal-feed URL:

```
GET /ical/{ical_token}.ics
```

- `ical_token`: UUID gegenereerd bij aanmaken gebruikersaccount, opgeslagen op `imp_users.ical_token`
- De URL is publiek toegankelijk (geen login) maar onraadbaar door de UUID
- Bevat **alle** afspraken van de inspecteur (geen tijdsbereik filter)
- Alleen planregels met status `GEPLAND` of `AFGEROND` worden opgenomen (geen CONCEPT, geen VERVALLEN)

### 7.7.2 iCal Prisma uitbreiding

```prisma
// Toevoegen aan imp_users model:
ical_token  String  @unique @default(uuid())
```

### 7.7.3 iCal event inhoud (RFC 5545)

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Inspectie Platform//NL
CALSCALE:GREGORIAN
X-WR-CALNAME:Inspecties [Naam Inspecteur]
X-WR-TIMEZONE:Europe/Amsterdam

BEGIN:VEVENT
UID:{planning_item_id}@platform
DTSTART:{scheduled_date in UTC}
DTEND:{end_time in UTC}
SUMMARY:{product_name} - {locatie naam}
DESCRIPTION:Opdrachtgever: {contact naam}\nAdres: {locatie adres}\nPortal: {public_token URL}
LOCATION:{locatie straat + huisnummer + postcode + stad}
ORGANIZER;CN={organisatie naam}:mailto:{organisatie email}
ATTENDEE;CN={inspecteur naam}:mailto:{inspecteur email}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT

END:VCALENDAR
```

- Content-Type header: `text/calendar; charset=utf-8`
- Content-Disposition header: `attachment; filename="inspecties.ics"`
- Tijdzone: Europe/Amsterdam (organisatie tijdzone)

### 7.7.4 .ics bijlage in afspraakbevestiging email

Het `.ics` bestand voor de opdrachtgever bevat één event:

```
SUMMARY:{product_name} inspectie
DESCRIPTION:Uw inspectieafspraak\nMeer informatie: {public_token URL}
LOCATION:{locatie adres}
ATTENDEE;CN={hoofdinspecteur naam}:mailto:{hoofdinspecteur email}
ORGANIZER;CN={organisatie naam}:mailto:{org email}
```

---

## 7.8 Publieke Afspraakpagina (Klantportaal)

URL: `platform.nl/afspraak/{public_token}` — geen login vereist.

### 7.8.1 Inhoud van de pagina

- Organisatielogo en branding
- **Afspraakgegevens**: datum, tijd, duur, locatie/object (naam + volledig adres)
- **Inspecteur(s)**: naam, foto/avatar (met kleurring), telefoonnummer en email van de hoofdinspecteur
- **Status badge**: Gepland / Afgerond / Vervallen
- **Q&A sectie**: klant kan vragen stellen (zelfde structuur als offerte Q&A, zie PRD-05 §5.10)
- **Verzetten knop**: zie §7.8.2
- **.ics download knop**: afspraak toevoegen aan eigen agenda

### 7.8.2 Verzetten knop logica

```
Afspraak > 7 dagen in de toekomst:
  → Groene/blauwe knop "Afspraak verzetten"
  → Klik opent modal met formulier:
      - Voorkeursdatum (date picker, verplicht)
      - Reden (textarea, verplicht, min. 10 karakters)
      - Naam klant (tekstveld, verplicht indien niet identificeerbaar)
      - Verstuur knop

Afspraak ≤ 7 dagen in de toekomst:
  → Grijze, uitgeschakelde knop
  → Tooltip/bijschrift: "Neem contact op om de afspraak te verzetten"
  → Organisatie contactgegevens zichtbaar (telefoon, email)

Afspraak is VERVALLEN of AFGEROND:
  → Knop niet zichtbaar
```

### 7.8.3 Q&A op de afspraakpagina

Zelfde implementatie als offerte Q&A (PRD-05 §5.10):
- Klant stelt vraag zonder login
- Medewerker antwoordt vanuit het platform
- Medewerker ontvangt notificatie bij nieuwe vraag van klant
- Klant ontvangt email bij antwoord van medewerker
- Thread bewaard bij de planregel

---

## 7.9 Portal UI — Planningsoverzicht

### 7.9.1 Lijstweergave

Kolommen:

| Kolom | Inhoud |
|-------|--------|
| Status | Badge met kleur (NOG_TE_PLANNEN / CONCEPT / GEPLAND / AFGEROND / VERVALLEN) |
| Datum & tijd | Geplande datum en starttijd |
| Duur | In uren (bijv. "1u 15m") |
| Opdrachtgever | Naam relatie + locatie |
| Product/dienst | Naam van de inspectiedienst |
| Inspecteur(s) | Avatar(s) met kleur, naam bij hover |
| Labels | Badges zoals "Verplaatst" |
| Acties | Bekijken, bewerken, verzetten, afgerond markeren |

Filters:
- Status (multi-select)
- Inspecteur (multi-select)
- Datum bereik (van/tot)
- Opdrachtgever (zoekbalk)
- Toon vervallen (toggle, standaard uit)

Sortering: datum (standaard oplopend), opdrachtgever, status.

Paginering: 25 per pagina, met totaalteller.

### 7.9.2 Kalenderweergave

- Maand / week / dag weergave switchbaar
- Afspraken getoond als gekleurde blokken met inspecteurkleur(en)
- **CONCEPT** afspraken: gestippelde/gestreepte rand om het blok
- **GEPLAND** afspraken: volle kleur
- **VERVALLEN** afspraken: alleen zichtbaar indien filter actief, grijs met doorhaling
- Klik op een blok: quick-view panel rechts of modal met afspraakdetails
- Drag & drop om datum te wijzigen (zet status terug naar CONCEPT na verplaatsing, vraagt om reden)
- Inspecteur filter: kalender tonen voor één of meerdere inspecteurs tegelijk
- Week/dag weergave toont tijdblokken per uur, afspraken schalen mee op duur

### 7.9.3 Detailpagina planregel

- Alle basisgegevens (datum, tijd, duur, locatie, opdrachtgever, product)
- Status badge
- Inspecteurs met acceptatiestatus per inspecteur (avatar + naam + PENDING/ACCEPTED/REJECTED)
- Knoppen: Bewerken | Afspraak verzetten | Markeer als afgerond | Verstuur bevestiging opnieuw
- Geschiedenis (timeline): alle wijzigingen chronologisch
- Q&A thread (intern): medewerkers onderling
- Publieke link naar klantportaal (kopieerbaar)
- Verplaatsingsinformatie: indien `replaces_id` gevuld, link naar originele planregel met originele datum

---

## 7.10 Notificaties — Planningsmodule

Aanvulling op PRD-06. Nieuwe notificatietypes toevoegen aan de `NotificationType` enum:

```prisma
// Toevoegen aan NotificationType enum in PRD-06:
AFSPRAAK_ACCEPTATIE_VERZOEK      // inspecteur uitgenodigd om te accepteren
AFSPRAAK_GEACCEPTEERD            // alle inspecteurs hebben geaccepteerd → status GEPLAND
AFSPRAAK_GEWEIGERD               // één inspecteur heeft geweigerd
AFSPRAAK_VERPLAATST              // afspraak verzet door medewerker
AFSPRAAK_VERZETTEN_VERZOEK       // klant verzoekt via portal om te verzetten
AFSPRAAK_BEVESTIGING_VERSTUURD   // bevestigingsmail gestuurd naar opdrachtgever
```

### Notificatie triggers

| Type | Trigger | Ontvangers |
|------|---------|-----------|
| AFSPRAAK_ACCEPTATIE_VERZOEK | Status → CONCEPT | Alle toegewezen inspecteurs |
| AFSPRAAK_GEACCEPTEERD | Alle inspecteurs geaccepteerd → GEPLAND | Aanmaker planregel + backoffice |
| AFSPRAAK_GEWEIGERD | Inspecteur weigert | Hoofdinspecteur + aanmaker planregel |
| AFSPRAAK_VERPLAATST | Medewerker verzet afspraak | Toegewezen inspecteurs + opdrachtgever (email) |
| AFSPRAAK_VERZETTEN_VERZOEK | Klant dient verzoek in via portal | Aanmaker planregel + backoffice rol |
| AFSPRAAK_BEVESTIGING_VERSTUURD | Status → GEPLAND | Aanmaker planregel (ter info) |

---

## 7.11 Email Templates (Resend)

### 7.11.1 Afspraakbevestiging (naar opdrachtgever)

**Onderwerp:** `Afspraakbevestiging – {product_name} op {datum}`

**Inhoud:**
- Organisatielogo en branding
- "Geachte {contact_naam},"
- Bevestiging van de afspraak: datum, tijd, duur
- Locatie: volledig adres
- Inspecteur(s): naam en contactgegevens van de hoofdinspecteur
- Knop: "Bekijk afspraakdetails" → `platform.nl/afspraak/{public_token}`
- .ics bijlage

### 7.11.2 Afspraak verplaatst (naar opdrachtgever)

**Onderwerp:** `Uw afspraak is verplaatst – {product_name}`

**Inhoud:**
- Melding dat de afspraak op {originele_datum} is komen te vervallen
- De nieuwe afspraak wordt zo spoedig mogelijk bevestigd
- Contactgegevens organisatie voor vragen

### 7.11.3 Acceptatieverzoek (naar inspecteur)

**Onderwerp:** `Nieuwe afspraak ingepland – {datum} – {locatie}`

**Inhoud:**
- Datum, tijd, duur
- Locatie/object adres
- Opdrachtgever naam
- Knop: "Bekijk en accepteer" → link naar planregel in het platform (vereist login)

### 7.11.4 Klant verzoekt verzetten (naar medewerker, intern)

**Onderwerp:** `[Actie vereist] Klant verzoekt afspraak te verzetten`

**Inhoud:**
- Naam klant, afspraakdatum, locatie
- Voorkeursdatum klant
- Reden van de klant
- Knop: "Bekijk aanvraag" → link naar planregel in het platform

---

## 7.12 API Endpoints — Planning

### Planregels

| Method | Endpoint | Beschrijving | Auth |
|--------|----------|-------------|------|
| GET | /planning | Lijst planregels (paginering, filters) | Ja |
| POST | /planning | Nieuwe planregel aanmaken | Ja |
| GET | /planning/:id | Planregel detail incl. history, inspecteurs, Q&A | Ja |
| PATCH | /planning/:id | Planregel bijwerken (datum, tijd, duur, inspecteurs) | Ja |
| POST | /planning/:id/reschedule | Afspraak verzetten (medewerker) — maakt nieuwe planregel | Ja |
| POST | /planning/:id/complete | Markeer als afgerond | Ja |
| POST | /planning/:id/send-confirmation | Bevestigingsmail opnieuw versturen | Ja |

### Inspecteur acceptatie

| Method | Endpoint | Beschrijving | Auth |
|--------|----------|-------------|------|
| POST | /planning/:id/accept | Inspecteur accepteert de afspraak | Ja (eigen account) |
| POST | /planning/:id/reject | Inspecteur weigert de afspraak (verplichte reden) | Ja (eigen account) |

### Q&A (intern — medewerkers)

| Method | Endpoint | Beschrijving | Auth |
|--------|----------|-------------|------|
| GET | /planning/:id/questions | Interne Q&A thread ophalen | Ja |
| POST | /planning/:id/questions | Vraag/antwoord toevoegen | Ja |

### Publieke endpoints (geen auth)

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | /public/planning/:token | Publieke afspraakpagina data |
| POST | /public/planning/:token/questions | Klant stelt vraag |
| POST | /public/planning/:token/reschedule-request | Klant dient verzet-verzoek in |
| GET | /public/planning/:token/ics | .ics download voor opdrachtgever (één event) |

### iCal feed

| Method | Endpoint | Beschrijving |
|--------|----------|-------------|
| GET | /ical/:ical_token.ics | Persoonlijke iCal feed inspecteur (geen auth, UUID-based) |

### Inspecteur kleur

| Method | Endpoint | Beschrijving | Auth |
|--------|----------|-------------|------|
| PATCH | /users/:id/color | Kleur instellen (eigen profiel of org admin) | Ja |

---

## 7.13 Implementatie Notities voor Claude Code

### Automatisch aanmaken planregel bij offerte acceptatie

In de `QuotesService`, na het updaten van de offerte status naar `GEACCEPTEERD`:

```typescript
// In quotes.service.ts, na status update naar GEACCEPTEERD:
await this.planningService.createFromQuote(quote);

// In planning.service.ts:
async createFromQuote(quote: Quote): Promise<PlanningItem> {
  return this.prisma.imp_planning_items.create({
    data: {
      org_id: quote.org_id,
      quote_id: quote.id,
      contact_id: quote.contact_id,
      location_id: quote.location_id,
      product_id: primaryLine?.product_id ?? null,
      product_name: primaryLine?.description ?? 'Inspectie',
      status: 'NOG_TE_PLANNEN',
      created_by: quote.created_by,
    }
  });
}
```

### Duur berekening

```typescript
// Eindtijd berekenen vanuit startdatum + duration_hours
function calculateEndTime(startDate: Date, durationHours: number): Date {
  const ms = durationHours * 60 * 60 * 1000;
  return new Date(startDate.getTime() + ms);
}

// Weergave: 1.25 → "1u 15m"
function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}u ${m}m` : `${h}u`;
}
```

### Alle inspecteurs geaccepteerd check

```typescript
async checkAllAccepted(planningItemId: string): Promise<void> {
  const inspectors = await this.prisma.imp_planning_inspectors.findMany({
    where: { planning_item_id: planningItemId }
  });

  const allAccepted = inspectors.every(i => i.acceptance_status === 'ACCEPTED');

  if (allAccepted) {
    await this.prisma.imp_planning_items.update({
      where: { id: planningItemId },
      data: { status: 'GEPLAND' }
    });
    await this.sendConfirmationEmail(planningItemId);
    await this.notificationService.send('AFSPRAAK_GEACCEPTEERD', planningItemId);
  }
}
```

### iCal generatie (gebruik de `ical-generator` npm package)

```bash
npm install ical-generator
```

```typescript
import ical from 'ical-generator';

async generateIcalFeed(icalToken: string): Promise<string> {
  const user = await this.prisma.imp_users.findUnique({
    where: { ical_token: icalToken }
  });

  const items = await this.prisma.imp_planning_items.findMany({
    where: {
      inspectors: { some: { user_id: user.id } },
      status: { in: ['GEPLAND', 'AFGEROND'] },
      is_cancelled: false,
    },
    include: { /* contact, location */ }
  });

  const cal = ical({ name: `Inspecties ${user.first_name} ${user.last_name}` });

  for (const item of items) {
    cal.createEvent({
      id: item.id,
      start: item.scheduled_date,
      end: item.end_time,
      summary: `${item.product_name} - ${item.location?.name}`,
      description: `Opdrachtgever: ${item.contact?.company_name}\nPortal: ${process.env.PUBLIC_URL}/afspraak/${item.public_token}`,
      location: `${item.location?.street} ${item.location?.house_number}, ${item.location?.postal_code} ${item.location?.city}`,
      timezone: 'Europe/Amsterdam',
    });
  }

  return cal.toString();
}
```

### 7 dagen check voor verzetten knop (frontend)

```typescript
function canReschedule(scheduledDate: Date): boolean {
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  return scheduledDate > sevenDaysFromNow;
}
```

### Verzetten flow (service)

```typescript
async reschedule(planningItemId: string, reason: string, userId: string): Promise<PlanningItem> {
  // 1. Huidige planregel annuleren
  await this.prisma.imp_planning_items.update({
    where: { id: planningItemId },
    data: {
      status: 'VERVALLEN',
      is_cancelled: true,
      cancelled_at: new Date(),
      cancelled_by: userId,
      cancel_reason: reason,
      labels: { push: 'Verplaatst' },
    }
  });

  // 2. History entry aanmaken op oude planregel
  await this.createHistoryEntry(planningItemId, userId, 'RESCHEDULED', reason);

  // 3. Nieuwe planregel aanmaken
  const original = await this.prisma.imp_planning_items.findUnique({ where: { id: planningItemId } });
  const newItem = await this.prisma.imp_planning_items.create({
    data: {
      ...pick(original, ['org_id', 'quote_id', 'contact_id', 'location_id', 'product_id', 'product_name']),
      status: 'NOG_TE_PLANNEN',
      replaces_id: planningItemId,
      original_date: original.scheduled_date,
      created_by: userId,
    }
  });

  // 4. Referentie terugzetten op oude planregel
  await this.prisma.imp_planning_items.update({
    where: { id: planningItemId },
    data: { replaced_by_id: newItem.id }
  });

  // 5. Email naar opdrachtgever: afspraak verplaatst
  await this.emailService.sendRescheduledNotification(original);

  return newItem;
}
```

### Kalenderweergave implementatie

Gebruik de `@fullcalendar/react` library voor de kalendercomponent:

```bash
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

- `daygrid` voor maandweergave
- `timegrid` voor week- en dagweergave
- `interaction` voor drag & drop
- Afspraken mappen naar FullCalendar events met `backgroundColor` op basis van inspecteurkleur
- CONCEPT afspraken: `borderColor` gestippeld via custom CSS class (`fc-event-concept`)

### NestJS module structuur

```
src/modules/planning/
  planning.module.ts
  planning.controller.ts
  planning.service.ts
  planning-ical.service.ts        // iCal generatie
  planning-email.service.ts       // email templates
  planning-public.controller.ts   // publieke endpoints (geen auth guard)
  dto/
    create-planning-item.dto.ts
    update-planning-item.dto.ts
    reschedule-request.dto.ts
    accept-reject.dto.ts
  entities/
    planning-item.entity.ts
```

---

## 7.14 Omgevingsvariabelen (aanvulling op PRD-01)

Geen extra environment variables nodig voor deze module. Tijdzone wordt per organisatie opgeslagen in `imp_organizations`:

```prisma
// Toevoegen aan imp_organizations:
timezone  String  @default("Europe/Amsterdam")
```

---

## 7.15 Dependencies

```bash
npm install ical-generator                                    # iCal feed generatie
npm install @fullcalendar/react @fullcalendar/daygrid \
            @fullcalendar/timegrid @fullcalendar/interaction  # Kalender UI
```

---

## 7.16 Implementatie Volgorde voor Claude Code

1. **Prisma schema uitbreiden** — nieuwe tabellen + uitbreidingen op `imp_users` en `imp_organizations`
2. **`prisma migrate dev`** uitvoeren
3. **PlanningModule aanmaken** in NestJS met module, controller, service
4. **Basis CRUD endpoints** — aanmaken, ophalen, bijwerken planregels
5. **Automatische aanmaak vanuit offerte** — hook in QuotesService
6. **Acceptatieflow** — accept/reject endpoints + all-accepted check + status update
7. **Email service** — bevestiging, verplaatsing, acceptatieverzoek (Resend)
8. **iCal service** — feed generatie + public endpoint
9. **Publieke endpoints** — afspraakpagina data, Q&A, verzet-verzoek
10. **Notificaties** — nieuwe types toevoegen aan NotificationService
11. **Frontend: Lijstweergave** — tabel met filters, paginering
12. **Frontend: Kalenderweergave** — FullCalendar integratie met drag & drop
13. **Frontend: Detailpagina** — acceptatiestatus, history, Q&A, acties
14. **Frontend: Publieke afspraakpagina** — klantportaal zonder login
15. **Frontend: Inspecteurkleur** — colorpicker in profielinstellingen + org admin beheer

---

*Inspectie Management Platform — PRD-07 Planning v1.0 — Vertrouwelijk*
